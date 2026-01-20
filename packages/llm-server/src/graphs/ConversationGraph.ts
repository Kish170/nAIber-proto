// May need to expand conversation graph to have nodes for health check in portion as well
import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { ConversationState, ConversationStateType } from "../states/ConversationState.js";
import { EmbeddingService } from "../../../shared/src/services/EmbeddingService.js";
import { IntentClassifier } from "../services/IntentClassifier.js";
import { MemoryRetriever } from "../services/MemoryRetriever.js";
import { TopicManager } from "../services/TopicManager.js";

export class ConversationGraph {
    private graph: any;
    private llm: ChatOpenAI;
    private embeddingService: EmbeddingService;
    private memoryRetriever: MemoryRetriever;
    private intentClassifier: IntentClassifier;
    private topicManager: TopicManager;
    constructor(openAIKey: string, embeddingService: EmbeddingService, memoryRetriever: MemoryRetriever, topicManager: TopicManager) {
        this.llm = new ChatOpenAI({
            apiKey: openAIKey,
            model: "gpt-4o",
            temperature: 0.7
        });
        this.embeddingService = embeddingService;
        this.memoryRetriever = memoryRetriever;
        this.topicManager = topicManager;
        this.intentClassifier = new IntentClassifier();

        this.graph = new StateGraph(ConversationState);

        this.graph.addNode("classify_intent", this.classifyIntent.bind(this));
        this.graph.addNode("retrieve_memories", this.retrieveMemories.bind(this));
        this.graph.addNode("check_topic_fatigue", this.checkTopicFatigue.bind(this));
        this.graph.addNode("generate_response", this.generateResponse.bind(this));
        this.graph.addNode("skip_rag", this.skipRAG.bind(this));

        this.graph.addNode("start_health_check", this.startHealthCheck.bind(this));
        this.graph.addNode("ask_health_question", this.askHealthQuestion.bind(this));
        this.graph.addNode("process_health_answer", this.processHealthAnswer.bind(this));
        this.graph.addNode("end_health_check", this.endHealthCheck.bind(this));

        this.graph.addConditionalEdges(
            "classify_intent",
            (state: ConversationStateType) => {
                if (state.isEndCall && !state.isHealthCheckComplete) return "start_health_check"
                return state.shouldProcessRAG ? "retrieve_memories" : "skip_rag"
            }
        );

        this.graph.addEdge("retrieve_memories", "check_topic_fatigue");
        this.graph.addEdge("check_topic_fatigue", "generate_response");
        this.graph.addEdge("skip_rag", "generate_response");
        this.graph.addEdge("generate_response", END);

        this.graph.addEdge("start_health_check", "ask_health_question");
        this.graph.addEdge("ask_health_question", "process_health_answer");
        this.graph.addConditionalEdges("process_health_answer", (state: ConversationStateType) => {
        if (state.currentQuestionIndex < state.healthQuestions.length) {
            return "ask_health_question";
        } else {
            return "end_health_check";
        }
        });
        this.graph.addEdge("end_health_check", END);

        this.graph.setEntryPoint("classify_intent");
    }

    private async classifyIntent(state: ConversationStateType) {
        const lastMessage = state.messages[state.messages.length - 1];
        const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

        const classification = this.intentClassifier.classifyIntent(content);

        return {
            shouldProcessRAG: classification.shouldProcessRAG,
            messageLength: classification.messageLength,
            hasSubstantiveContent: classification.hasSubstantiveContent,
            isContinuation: classification.isContinuation,
            isShortResponse: classification.isShortResponse
        };
    }

    private async retrieveMemories(state: ConversationStateType) {
        const lastMessage = state.messages[state.messages.length - 1];
        const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

        const newEmbedding = await this.embeddingService.embedQuery(content);
        const topicChanged = await this.topicManager.detectTopicChange(
            state.conversationId,
            newEmbedding,
            state.messageLength
        );

        let memories: string[] = [];

        if (topicChanged || state.topicFatigue > 0.25) {
            if (topicChanged) {
                await this.topicManager.resetTopicFatigue(state.conversationId);
            }

            const retrievedMemories = await this.memoryRetriever.retrieveMemories(
                state.userId,
                newEmbedding,
                5
            );
            memories = retrievedMemories.highlights;
        }

        return {
            retrievedMemories: memories,
            currentTopicVector: newEmbedding,
            topicChanged,
            messageCount: topicChanged ? 1 : state.messageCount + 1
        };
    }

    private async checkTopicFatigue(state: ConversationStateType) {
        await this.topicManager.updateTopicState(
            state.conversationId,
            state.currentTopicVector || [],
            state.messageLength
        );

        const topicState = await this.topicManager.getCurrentTopic(state.conversationId);
        const topicFatigue = topicState?.topicFatigue || 0;

        let fatigueGuidance = "";
        if (topicFatigue >= 0.75) {
            fatigueGuidance = "TOPIC CHANGE RECOMMENDED: Topic extensively discussed...";
        } else if (topicFatigue >= 0.50) {
            fatigueGuidance = "TOPIC FRESHNESS NEEDED: Topic thoroughly covered...";
        } else if (topicFatigue >= 0.25) {
            fatigueGuidance = "TOPIC ENGAGEMENT NOTE: Watch for user interest cues...";
        }

        return { topicFatigue, fatigueGuidance };
    }

    private async generateResponse(state: ConversationStateType) {
        let contextSection = "";
        if (state.retrievedMemories.length > 0) {
            contextSection = `# RELEVANT MEMORIES FROM PAST CONVERSATIONS
            ${state.retrievedMemories.map((m, i) => `${i + 1}. ${m}`).join('\n')}

            Use these memories to provide continuity and personalization.
            `;
        }

        if (state.fatigueGuidance) {
            contextSection += `\n\n${state.fatigueGuidance}`;
        }

        const systemPromptText = `${this.getSystemPrompt(state.userId)}

        ${contextSection}`;

        const recentMessages = state.messages.slice(-10);

        const messages = [
            new SystemMessage(systemPromptText),
            ...recentMessages
        ];

        const response = await this.llm.invoke(messages, {
            response_format: { type: 'json_object' }
        });

        let content: string;
        if (typeof response.content === 'string') {
            content = response.content;
        } else if (Array.isArray(response.content)) {
            content = response.content
                .map(part => typeof part === 'string' ? part : JSON.stringify(part))
                .join('');
        } else {
            content = String(response.content);
        }

        let parsedResponse: { response: string; is_end_call_detected: boolean };
        try {
            parsedResponse = JSON.parse(content);
        } catch (error) {
            console.error('[ConversationGraph] Failed to parse JSON response:', error);
            console.error('[ConversationGraph] Raw content:', content);
            return { response: content, isEndCall: false };
        }

        if (!parsedResponse.response || typeof parsedResponse.is_end_call_detected !== 'boolean') {
            console.error('[ConversationGraph] Invalid response structure:', parsedResponse);
            return {
                response: parsedResponse.response || content,
                isEndCall: parsedResponse.is_end_call_detected ?? false
            };
        }

        console.log('[ConversationGraph] End call detection:', {
            isEndCallDetected: parsedResponse.is_end_call_detected,
            response: parsedResponse.response.substring(0, 100)
        });

        return {
            response: parsedResponse.response,
            isEndCall: parsedResponse.is_end_call_detected
        };
    }

    private async skipRAG(state: ConversationStateType) {
        return {
            messageCount: state.messageCount + 1
        };
    }

    private getSystemPrompt(userId: string): string {
        return `
            You are a helpful AI assistant having a conversation with user ${userId}.
            Your goal is to provide contextual, natural responses.

            If you think the user is about to end the call (e.g., says goodbye, mentions ending, or closing remarks), 
            set "is_end_call_detected" to true. Otherwise, set it to false.

            Return your output in JSON with these fields:
            {
            "response": "assistant's next message",
            "is_end_call_detected": boolean
            }
        `;
    }

    private async startHealthCheck(state: ConversationStateType) {
        console.log('[ConversationGraph] Starting health check');
        return {
            healthQuestions: [
                "On a scale of 1–10, how are you feeling overall right now?",
                "Are you experiencing any physical symptoms at the moment?",
                "Have you taken your prescribed medications today?",
                "How would you rate your sleep last night from 1–10?",
                "Is there anything else you'd like to note about how you're feeling?"
            ],
            currentQuestionIndex: 0
        };
    }

    private async askHealthQuestion(state: ConversationStateType) {
        const question = state.healthQuestions[state.currentQuestionIndex];
        return { response: question };
    }

    private async processHealthAnswer(state: ConversationStateType) {
        const lastMessage = state.messages[state.messages.length - 1];

        let answer: string;
        if (typeof lastMessage.content === 'string') {
            answer = lastMessage.content;
        } else if (Array.isArray(lastMessage.content)) {
            answer = lastMessage.content
                .map(part => typeof part === 'string' ? part : JSON.stringify(part))
                .join('');
        } else {
            answer = String(lastMessage.content);
        }

        const currentIndex = state.currentQuestionIndex;
        const currentQuestion = state.healthQuestions[currentIndex];
        let validatedAnswer: string;

        if (currentQuestion.includes("scale of 1–10")) {
            const num = parseInt(answer.trim());
            if (isNaN(num) || num < 1 || num > 10) {
                validatedAnswer = "not answered";
            } else {
                validatedAnswer = num.toString();
            }
        } else {
            validatedAnswer = answer.trim() || "not answered";
        }

        return {
            healthAnswer: [validatedAnswer],
            currentQuestionIndex: currentIndex + 1
        };
    }

    private async endHealthCheck(state: ConversationStateType) {

    }

    public compile() {
        return this.graph.compile();
    }
}