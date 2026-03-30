import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { HealthCheckState, HealthCheckStateType } from "./HealthCheckState.js";
import { HealthCheckHandler } from "./HealthCheckHandler.js";
import { QuestionData } from "./questions/index.js";
import { OpenAIClient } from "@naiber/shared-clients";
import { AnswerInterpreter } from "./AnswerInterpreter.js";
import { DecisionEngine } from "./DecisionEngine.js";
import { QuestionContextBuilder } from "./QuestionContextBuilder.js";

export class HealthCheckGraph {
    private llm: ChatOpenAI;
    private answerInterpreter: AnswerInterpreter;
    private decisionEngine: DecisionEngine;
    private contextBuilder: QuestionContextBuilder;
    private compiledGraph: any;
    private initialQuestions?: QuestionData[];

    constructor(openAIClient: OpenAIClient, checkpointer: BaseCheckpointSaver, initialQuestions?: QuestionData[]) {
        const chatModel = openAIClient.returnChatModel() as ChatOpenAI;
        this.llm = chatModel;
        this.answerInterpreter = new AnswerInterpreter(chatModel);
        this.decisionEngine = new DecisionEngine(chatModel);
        this.contextBuilder = new QuestionContextBuilder();
        this.initialQuestions = initialQuestions;

        const graph: any = new StateGraph(HealthCheckState);

        graph.addNode("orchestrator", this.orchestrate.bind(this));
        graph.addNode("ask_question", this.askQuestion.bind(this));
        graph.addNode("wait_for_answer", this.waitForAnswer.bind(this));
        graph.addNode("interpret_answer", this.interpretAnswer.bind(this));
        graph.addNode("evaluate_and_decide", this.evaluateAndDecide.bind(this));
        graph.addNode("finalize", this.finalize.bind(this));

        graph.setEntryPoint("orchestrator");
        graph.addEdge("orchestrator", "ask_question");
        graph.addEdge("ask_question", "wait_for_answer");
        graph.addEdge("wait_for_answer", "interpret_answer");
        graph.addEdge("interpret_answer", "evaluate_and_decide");
        graph.addConditionalEdges("evaluate_and_decide", this.routeFromDecision.bind(this));
        graph.addEdge("finalize", END);

        this.compiledGraph = graph.compile({ checkpointer });
    }

    private async orchestrate(state: HealthCheckStateType) {
        if (state.healthCheckQuestions?.length > 0) {
            console.log('[HealthCheckGraph] Questions already loaded, skipping re-init');
            return {};
        }

        console.log('[HealthCheckGraph] Initializing health check for userId:', state.userId);

        let questionData: QuestionData[];
        let previousCallContext: string | null = null;

        if (this.initialQuestions) {
            questionData = this.initialQuestions;
        } else {
            const initialized = await HealthCheckHandler.initializeHealthCheck(state.userId);
            questionData = initialized.questions.map(q => q.toJSON() as QuestionData);
            previousCallContext = initialized.previousCallContext;
        }

        console.log('[HealthCheckGraph] Loaded questions:', {
            userId: state.userId,
            totalQuestions: questionData.length,
            hasPreviousContext: previousCallContext != null
        });

        return {
            healthCheckQuestions: questionData,
            currentQuestionIndex: 0,
            questionAttempts: 0,
            healthCheckAnswers: [],
            ...(previousCallContext != null ? { previousCallContext } : {})
        };
    }

    private async askQuestion(state: HealthCheckStateType) {
        const question = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!question) {
            console.error('[HealthCheckGraph] No question at index:', state.currentQuestionIndex);
            return {
                response: "I'm sorry, something went wrong. Let's end the health check here.",
                isHealthCheckComplete: true
            };
        }

        const { systemPrompt, messageWindowSize } = this.contextBuilder.build(question, state);
        const history = this.contextBuilder.filterMessages(state.messages, messageWindowSize);

        const originalSystem = state.messages.find(m => m instanceof SystemMessage);
        const combined = originalSystem
            ? `${originalSystem.content}\n\n${systemPrompt}`
            : systemPrompt;

        const llmResponse = await this.llm.invoke([new SystemMessage(combined), ...history]);

        const content = typeof llmResponse.content === 'string'
            ? llmResponse.content
            : Array.isArray(llmResponse.content)
                ? llmResponse.content.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('')
                : String(llmResponse.content);

        console.log('[HealthCheckGraph] Question generated:', {
            questionIndex: state.currentQuestionIndex,
            total: state.healthCheckQuestions.length,
            action: state.currentDecision?.action ?? 'initial'
        });

        return {
            response: content,
            pendingClarification: false,
            clarificationContext: ""
        };
    }

    private waitForAnswer(state: HealthCheckStateType) {
        if (!state.healthCheckQuestions?.length || state.currentQuestionIndex == null) {
            console.error('[HealthCheckGraph] waitForAnswer called with invalid state — completing early');
            return { isHealthCheckComplete: true };
        }

        const userAnswer = interrupt({
            question: state.healthCheckQuestions[state.currentQuestionIndex],
            questionIndex: state.currentQuestionIndex,
            response: state.response
        });

        console.log('[HealthCheckGraph] Received answer:', {
            questionIndex: state.currentQuestionIndex,
            answerPreview: String(userAnswer).substring(0, 100)
        });

        return { rawAnswer: String(userAnswer) };
    }

    private async interpretAnswer(state: HealthCheckStateType) {
        const question = state.healthCheckQuestions[state.currentQuestionIndex];
        const interpretation = await this.answerInterpreter.interpret(question, state.rawAnswer);
        return { lastInterpretation: interpretation };
    }

    private async evaluateAndDecide(state: HealthCheckStateType) {
        const { decision, stateUpdates } = await this.decisionEngine.evaluate(
            state,
            state.lastInterpretation!
        );
        return { currentDecision: decision, ...stateUpdates };
    }

    private finalize(state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] Health check complete:', {
            userId: state.userId,
            totalAnswers: state.healthCheckAnswers.length,
            validAnswers: state.healthCheckAnswers.filter(a => a.isValid).length
        });

        return {
            response: "Thank you for completing your health check! All your responses have been recorded. Take care, goodbye!",
            isHealthCheckComplete: true
        };
    }

    private routeFromDecision(state: HealthCheckStateType): "ask_question" | "finalize" {
        if (state.isHealthCheckComplete) return "finalize";
        if (state.currentQuestionIndex >= state.healthCheckQuestions.length) return "finalize";
        return "ask_question";
    }

    get graph() {
        return this.compiledGraph;
    }
}