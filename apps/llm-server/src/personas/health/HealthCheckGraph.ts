import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { HealthCheckState, HealthCheckStateType, DynamicQuestion, CompletedQuestion } from "./HealthCheckState.js";
import { HealthCheckHandler } from "./HealthCheckHandler.js";
import { OpenAIClient, RedisClient } from "@naiber/shared-clients";
import { TurnAnalyzer } from "./validation/TurnAnalyzer.js";
import { QuestionContextBuilder } from "./QuestionContextBuilder.js";
import { openWindow, closeWindow } from "./MedallionWindow.js";
import { enqueue, markInProgress, markComplete, next } from "./DynamicQuestionStore.js";
import type { CompletedWindow } from "./HealthCheckState.js";

export class HealthCheckGraph {
    private llm: ChatOpenAI;
    private turnAnalyzer: TurnAnalyzer;
    private contextBuilder: QuestionContextBuilder;
    private compiledGraph: any;
    private initialQuestions?: DynamicQuestion[];

    constructor(openAIClient: OpenAIClient, checkpointer: BaseCheckpointSaver, initialQuestions?: DynamicQuestion[]) {
        const chatModel = openAIClient.returnChatModel() as ChatOpenAI;
        this.llm = chatModel;
        this.turnAnalyzer = new TurnAnalyzer(chatModel);
        this.contextBuilder = new QuestionContextBuilder();
        this.initialQuestions = initialQuestions;

        const graph: any = new StateGraph(HealthCheckState);

        graph.addNode("opening_orchestrator", this.openingOrchestrator.bind(this));
        graph.addNode("ask_opening", this.askOpening.bind(this));
        graph.addNode("wait_for_answer", this.waitForAnswer.bind(this));
        graph.addNode("classify_opening_answer", this.classifyOpeningAnswer.bind(this));
        graph.addNode("well_path", this.wellPath.bind(this));
        graph.addNode("poorly_path", this.poorlyPath.bind(this));
        graph.addNode("health_relevance_check", this.healthRelevanceCheck.bind(this));
        graph.addNode("end_not_ready", this.endNotReady.bind(this));

        graph.addNode("conversation_start", this.conversationStart.bind(this));
        graph.addNode("orchestrate_next", this.orchestrateNext.bind(this));
        graph.addNode("ask_question", this.askQuestion.bind(this));
        graph.addNode("classify_turn", this.classifyTurn.bind(this));
        graph.addNode("handle_refusal", this.handleRefusal.bind(this));
        graph.addNode("handle_tangent", this.handleTangent.bind(this));
        graph.addNode("advance_question", this.advanceQuestion.bind(this));
        graph.addNode("finalize", this.finalize.bind(this));

        graph.setEntryPoint("opening_orchestrator");
        graph.addEdge("opening_orchestrator", "ask_opening");
        graph.addEdge("ask_opening", "wait_for_answer");
        graph.addEdge("wait_for_answer", "classify_opening_answer");
        graph.addConditionalEdges("classify_opening_answer", this.routeFromOpeningClassification.bind(this));
        graph.addEdge("well_path", "ask_opening");
        graph.addEdge("poorly_path", "ask_opening");
        graph.addEdge("health_relevance_check", "ask_opening");
        graph.addEdge("end_not_ready", END);

        graph.addEdge("conversation_start", "orchestrate_next");
        graph.addConditionalEdges("orchestrate_next", this.routeFromOrchestrate.bind(this));
        graph.addEdge("ask_question", "wait_for_answer");
        graph.addConditionalEdges("classify_turn", this.routeFromTurn.bind(this));
        graph.addEdge("handle_refusal", "advance_question");
        graph.addEdge("handle_tangent", "ask_question");
        graph.addConditionalEdges("advance_question", this.routeFromAdvance.bind(this));
        graph.addEdge("finalize", END);

        this.compiledGraph = graph.compile({ checkpointer });
    }

    private async openingOrchestrator(state: HealthCheckStateType) {
        if (state.pendingQuestions?.length > 0 || state.openingPhase === 'conversation') {
            console.log('[HealthCheckGraph] Resuming existing session');
            return {};
        }

        console.log('[HealthCheckGraph] Initializing health check for userId:', state.userId);

        let questions: DynamicQuestion[];
        let previousCallContext: string | null = null;

        if (this.initialQuestions) {
            questions = this.initialQuestions;
        } else {
            const initialized = await HealthCheckHandler.initializeHealthCheck(state.userId);
            questions = initialized.questions;
            previousCallContext = initialized.previousCallContext;
        }

        console.log('[HealthCheckGraph] Loaded questions:', { total: questions.length });

        return {
            pendingQuestions: questions,
            openingPhase: 'greeting' as const,
            ...(previousCallContext != null ? { previousCallContext } : {})
        };
    }

    private async askOpening(state: HealthCheckStateType) {
        const { systemPrompt, messageWindowSize } = this.contextBuilder.buildOpening(
            state.openingPhase,
            state.previousCallContext
        );

        // Do NOT prepend the ElevenLabs system message here — it contains full health
        // question instructions that override the opening-phase constraint and cause
        // the LLM to ask health questions before the opening flow completes.
        const history = this.contextBuilder.filterMessages(state.messages, messageWindowSize);
        const llmResponse = await this.llm.invoke([new SystemMessage(systemPrompt), ...history]);
        const content = extractContent(llmResponse);

        return { response: content };
    }

    private waitForAnswer(state: HealthCheckStateType) {
        const userAnswer = interrupt({ response: state.response });
        console.log('[HealthCheckGraph] Received answer (phase:', state.openingPhase, ')');
        return { rawAnswer: String(userAnswer) };
    }

    private async classifyOpeningAnswer(state: HealthCheckStateType) {
        const { openingPhase, rawAnswer } = state;

        if (openingPhase === 'conversation') {
            return { lastClassification: null };
        }

        if (openingPhase === 'greeting' || openingPhase === 'wellbeing_asked') {
            const sentiment = await this.turnAnalyzer.analyzeOpeningSentiment(rawAnswer, state.response);
            console.log('[HealthCheckGraph] classify_opening_answer: sentiment=%s phase=%s answer="%s"', sentiment, openingPhase, rawAnswer.substring(0, 60));
            return { openingSentiment: sentiment };
        }

        if (openingPhase === 'ready_check') {
            const result = await this.turnAnalyzer.analyze(rawAnswer, { openingPhase });
            console.log('[HealthCheckGraph] classify_opening_answer: intent=%s phase=ready_check answer="%s"', result.intent, rawAnswer.substring(0, 60));
            return { lastClassification: { intent: result.intent, isOnTopic: true, readyToAdvance: false } };
        }

        return {};
    }

    private routeFromOpeningClassification(state: HealthCheckStateType): string {
        const { openingPhase, openingSentiment, lastClassification } = state;

        if (openingPhase === 'conversation') {
            console.log('[HealthCheckGraph] route_opening: → classify_turn');
            return 'classify_turn';
        }

        if (openingPhase === 'greeting' || openingPhase === 'wellbeing_asked') {
            console.log('[HealthCheckGraph] route_opening: sentiment=%s → %s', openingSentiment,
                openingSentiment === 'WELL' ? 'well_path' : openingSentiment === 'POORLY' ? 'poorly_path' : 'ask_opening(re-ask)');
            if (openingSentiment === 'WELL') return 'well_path';
            if (openingSentiment === 'POORLY') return 'poorly_path';
            return 'ask_opening';
        }

        if (openingPhase === 'poorly_probing') {
            console.log('[HealthCheckGraph] route_opening: → health_relevance_check');
            return 'health_relevance_check';
        }

        if (openingPhase === 'ready_check') {
            const dest = lastClassification?.intent === 'REFUSING' ? 'end_not_ready' : 'conversation_start';
            console.log('[HealthCheckGraph] route_opening: intent=%s → %s', lastClassification?.intent, dest);
            return dest;
        }

        return 'ask_opening';
    }

    private wellPath(_state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] well_path: elder is feeling well → ready_check');
        return { openingPhase: 'ready_check' as const };
    }

    private poorlyPath(_state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] poorly_path: elder is not feeling well → poorly_probing');
        return { openingPhase: 'poorly_probing' as const };
    }

    private async healthRelevanceCheck(state: HealthCheckStateType) {
        const result = await this.turnAnalyzer.analyze(state.rawAnswer, { openingPhase: 'poorly_probing' });

        if (result.isHealthRelated && state.rawAnswer.trim()) {
            console.log('[HealthCheckGraph] health_relevance_check: health-related concern, enqueueing');
            const concern = state.rawAnswer.trim();
            const newQuestion: DynamicQuestion = {
                id: `opening_concern_${Date.now()}`,
                topic: (result.suggestedTopic ?? 'OTHER_HEALTH') as DynamicQuestion['topic'],
                questionText: `Earlier you mentioned ${concern.substring(0, 80)} — can you tell me more about that?`,
                questionType: 'text' as const,
                source: 'tangent_created' as const,
                addedAt: Date.now()
            };
            return {
                openingConcern: concern,
                openingPhase: 'ready_check' as const,
                pendingQuestions: enqueue(state.pendingQuestions, newQuestion)
            };
        }

        console.log('[HealthCheckGraph] health_relevance_check: non-health concern, redirecting');
        return { openingPhase: 'ready_check' as const };
    }

    private async endNotReady(state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] end_not_ready: elder declined check-in');
        const { systemPrompt, messageWindowSize } = this.contextBuilder.buildEndNotReady(state.rawAnswer);
        const history = this.contextBuilder.filterMessages(state.messages, messageWindowSize);
        const result = await this.llm.invoke([new SystemMessage(systemPrompt), ...history]);

        return {
            response: extractContent(result),
            isHealthCheckComplete: true,
            openingPhase: 'done' as const,
            openingDisposition: 'ENDED_NOT_READY' as const,
            openingEndReason: state.rawAnswer
        };
    }

    private conversationStart(state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] conversation_start: entering main loop');
        return {
            openingPhase: 'conversation' as const,
            openingDisposition: 'PROCEEDED' as const
        };
    }

    private async orchestrateNext(state: HealthCheckStateType) {
        let allPending = [...state.pendingQuestions];
        const redisKey = `health:new_questions:${state.conversationId}`;
        try {
            const rawClient = RedisClient.getInstance().getClient();
            const queued = await rawClient.lRange(redisKey, 0, -1);
            if (queued.length) {
                await rawClient.del(redisKey);
                for (const raw of queued) {
                    allPending = enqueue(allPending, JSON.parse(raw));
                }
                console.log(`[HealthCheckGraph] orchestrate_next: drained ${queued.length} queued question(s)`);
            }
        } catch (err) {
            console.warn('[HealthCheckGraph] orchestrate_next: Redis drain failed (non-fatal):', err);
        }

        const completedIds = new Set(state.completedWindows.map((w: CompletedWindow) => w.question.id));
        const available = allPending.filter(q => !completedIds.has(q.id));

        const question = next(available);

        if (!question) {
            console.log('[HealthCheckGraph] orchestrate_next: no more questions');
            return { isHealthCheckComplete: true, pendingQuestions: available };
        }

        const { pending, inProgress } = markInProgress(available, question.id);
        const windowState = openWindow(question);

        console.log('[HealthCheckGraph] orchestrate_next: starting question', { topic: question.topic, id: question.id });

        return {
            pendingQuestions: pending,
            inProgressQuestion: inProgress,
            currentWindowId: windowState.currentWindowId,
            currentWindowMessages: [],
            subQuestionCount: 0
        };
    }

    private routeFromOrchestrate(state: HealthCheckStateType): string {
        if (state.isHealthCheckComplete) return 'finalize';
        return 'ask_question';
    }

    private async askQuestion(state: HealthCheckStateType) {
        const question = state.inProgressQuestion;
        if (!question) {
            return { response: "Thank you for your time today. That covers everything for now.", isHealthCheckComplete: true };
        }

        const mode = state.subQuestionCount > 0 ? 'sub_question' : 'ask';
        const { systemPrompt, messageWindowSize } = this.contextBuilder.buildConversation(question, state, mode);

        const originalSystem = state.messages.find((m: any) => m instanceof SystemMessage);
        const combined = originalSystem
            ? `${originalSystem.content}\n\n${systemPrompt}`
            : systemPrompt;

        const history = this.contextBuilder.filterMessages(state.messages, messageWindowSize);
        const llmResponse = await this.llm.invoke([new SystemMessage(combined), ...history]);
        const content = extractContent(llmResponse);

        console.log('[HealthCheckGraph] ask_question:', { topic: question.topic, subCount: state.subQuestionCount });

        const aiMsg = new AIMessage(content);
        return {
            response: content,
            currentWindowMessages: [...state.currentWindowMessages, aiMsg]
        };
    }

    private async classifyTurn(state: HealthCheckStateType) {
        const question = state.inProgressQuestion;
        const rawAnswer = state.rawAnswer;

        const result = await this.turnAnalyzer.analyze(rawAnswer, {
            question,
            openingPhase: 'conversation',
            subQuestionCount: state.subQuestionCount,
            previousResponse: state.response,
            pendingQuestions: state.pendingQuestions
        });

        console.log('[HealthCheckGraph] classify_turn:', {
            topic: question?.topic,
            intent: result.intent,
            isOnTopic: result.isOnTopic,
            readyToAdvance: result.readyToAdvance,
            engagement: result.engagement,
            tangentAction: result.tangentAction
        });

        const humanMsg = new HumanMessage(rawAnswer);

        return {
            lastClassification: {
                intent: result.intent as 'ANSWERING' | 'ASKING' | 'REFUSING',
                isOnTopic: result.isOnTopic,
                readyToAdvance: result.readyToAdvance,
                sentiment: result.sentiment,
                engagement: result.engagement,
                tangentAction: result.tangentAction,
                tangentTargetQuestionId: result.tangentTargetQuestionId,
                tangentNewTopic: result.tangentNewTopic,
                tangentNewQuestionText: result.tangentNewQuestionText
            },
            currentWindowMessages: [...state.currentWindowMessages, humanMsg]
        };
    }

    private routeFromTurn(state: HealthCheckStateType): string {
        const classification = state.lastClassification;
        if (!classification) return 'ask_question';

        const { intent, isOnTopic } = classification;

        if (intent === 'REFUSING') return 'handle_refusal';
        if (!isOnTopic) return 'handle_tangent';
        return 'advance_question';
    }

    private async handleRefusal(state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] handle_refusal: recording refusal for', state.inProgressQuestion?.topic);
        return {};
    }

    private async handleTangent(state: HealthCheckStateType) {
        const classification = state.lastClassification;
        const action = classification?.tangentAction ?? 'redirect';

        console.log('[HealthCheckGraph] handle_tangent:', action);

        if (action === 'create_new_pending' &&
            classification?.tangentNewTopic &&
            classification?.tangentNewQuestionText) {
            const mcpUrl = process.env.MCP_SERVER_URL || 'http://mcp-server:3002';
            try {
                await fetch(`${mcpUrl}/tools/add_health_question`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        topic: classification.tangentNewTopic,
                        questionText: classification.tangentNewQuestionText,
                        conversationId: state.conversationId
                    })
                });
                console.log('[HealthCheckGraph] handle_tangent: queued new question via MCP:', classification.tangentNewTopic);
            } catch (err) {
                console.warn('[HealthCheckGraph] handle_tangent: MCP write failed (non-fatal):', err);
            }
            return {};
        }

        if (action === 'merge_into_pending') {
            console.log('[HealthCheckGraph] handle_tangent: merge_into_pending', classification?.tangentTargetQuestionId);
            return {};
        }

        const { systemPrompt } = this.contextBuilder.buildConversation(
            state.inProgressQuestion!,
            state,
            'tangent_redirect'
        );
        const llmResponse = await this.llm.invoke([new SystemMessage(systemPrompt)]);
        return { response: extractContent(llmResponse) };
    }

    private async advanceQuestion(state: HealthCheckStateType) {
        const question = state.inProgressQuestion;
        if (!question || !state.currentWindowId) {
            return { isHealthCheckComplete: true };
        }

        const disposition = state.lastClassification?.intent === 'REFUSING' ? 'refused' : 'answered';

        if (disposition === 'answered') {
            const readyToAdvance = state.lastClassification?.readyToAdvance ?? false;
            if (!readyToAdvance && state.subQuestionCount < 5) {
                console.log('[HealthCheckGraph] advance_question: sub-question', {
                    topic: question.topic,
                    subCount: state.subQuestionCount + 1
                });
                return { subQuestionCount: state.subQuestionCount + 1 };
            }
        }

        const completedWindow: CompletedWindow = closeWindow(
            state.currentWindowId,
            question,
            state.currentWindowMessages,
            disposition,
            question.addedAt
        );

        const { inProgress: _, completed } = markComplete(
            question,
            state.completedQuestions,
            state.currentWindowId,
            disposition
        );

        console.log('[HealthCheckGraph] advance_question: completed', question.topic, `(${disposition})`);

        return {
            completedWindows: [completedWindow],
            completedQuestions: completed,
            inProgressQuestion: null,
            currentWindowId: null,
            currentWindowMessages: [],
            subQuestionCount: 0
        };
    }

    private routeFromAdvance(state: HealthCheckStateType): string {
        if (state.inProgressQuestion !== null && state.subQuestionCount > 0) return 'ask_question';
        if (state.isHealthCheckComplete) return 'finalize';
        return 'orchestrate_next';
    }

    private async finalize(state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] finalizing:', {
            userId: state.userId,
            completed: state.completedQuestions.length
        });

        const { systemPrompt, messageWindowSize } = this.contextBuilder.buildFinalize(state.completedQuestions.length);
        const history = this.contextBuilder.filterMessages(state.messages, messageWindowSize);
        const result = await this.llm.invoke([new SystemMessage(systemPrompt), ...history]);

        const goodbye = extractContent(result) || "Thank you for sharing today. Take good care of yourself — goodbye!";

        return {
            response: goodbye,
            isHealthCheckComplete: true,
            openingPhase: 'done' as const
        };
    }

    get graph() {
        return this.compiledGraph;
    }
}

function extractContent(llmResponse: any): string {
    return typeof llmResponse.content === 'string'
        ? llmResponse.content
        : Array.isArray(llmResponse.content)
            ? llmResponse.content.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('')
            : String(llmResponse.content);
}