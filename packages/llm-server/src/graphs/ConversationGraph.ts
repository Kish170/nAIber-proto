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

        this.graph.addConditionalEdges(
            "classify_intent",
            (state: ConversationStateType) => state.shouldProcessRAG ? "retrieve_memories" : "skip_rag"
        );

        this.graph.addEdge("retrieve_memories", "check_topic_fatigue");
        this.graph.addEdge("check_topic_fatigue", "generate_response");
        this.graph.addEdge("skip_rag", "generate_response");
        this.graph.addEdge("generate_response", END);

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

        const response = await this.llm.invoke(messages);

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

        return { response: content };
    }

    private async skipRAG(state: ConversationStateType) {
        return {
            messageCount: state.messageCount + 1
        };
    }

    private getSystemPrompt(userId: string): string {
        return `You are a helpful AI assistant having a conversation with user ${userId}.
                Your goal is to provide thoughtful, contextual responses based on the conversation history and any relevant memories from past interactions.`;
    }

    public compile() {
        return this.graph.compile();
    }
}