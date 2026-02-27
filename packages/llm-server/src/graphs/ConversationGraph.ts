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
        this.llm = new ChatOpenAI({ // use llm from openaicleint
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
        this.graph.addNode("manage_topic_state", this.manageTopicState.bind(this))
        // this.graph.addNode("check_topic_fatigue", this.checkTopicFatigue.bind(this));
        this.graph.addNode("generate_response", this.generateResponse.bind(this));
        this.graph.addNode("skip_rag", this.skipRAG.bind(this));

        this.graph.addConditionalEdges(
            "classify_intent",
            (state: ConversationStateType) => {
                return state.shouldProcessRAG ? "manage_topic_state" : "skip_rag"
            }
        );

        // this.graph.addEdge("retrieve_memories", "check_topic_fatigue");
        // this.graph.addEdge("check_topic_fatigue", "generate_response");
        this.graph.addEdge("manage_topic_state", "retrieve_memories");
        this.graph.addEdge("retrieve_memories", "generate_response");
        this.graph.addEdge("skip_rag", "generate_response");
        this.graph.addEdge("generate_response", END);

        this.graph.setEntryPoint("classify_intent");
    }

    private async classifyIntent(state: ConversationStateType) {
        try {
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
        } catch (error) {
            console.error('[ConversationGraph] classifyIntent failed, defaulting to process RAG:', error);
            return { shouldProcessRAG: true, messageLength: 0, hasSubstantiveContent: true, isContinuation: false, isShortResponse: false };
        }
    }

    private async manageTopicState(state: ConversationStateType) {
        try {
            const lastMessage = state.messages[state.messages.length - 1];
            const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

            const { embedding: newEmbedding } = await this.embeddingService.generateEmbedding(content);
            const topicChanged = await this.topicManager.detectTopicChange(
                state.conversationId,
                newEmbedding,
                state.messageLength
            );

            await this.topicManager.manageTopicState(
                state.conversationId,
                newEmbedding,
                state.messageLength,
                topicChanged
            );

            return {
                currentTopicVector: newEmbedding,
                topicChanged,
                messageCount: topicChanged ? 1 : state.messageCount + 1
            };
        } catch (error) {
            console.error('[ConversationGraph] manageTopicState failed, serving from cache:', error);
            return { topicChanged: false, currentTopicVector: state.currentTopicVector, messageCount: state.messageCount + 1 };
        }
    }

    private async retrieveMemories(state: ConversationStateType) {
        try {
            let memories: string[] = [];

            const hasVector = state.currentTopicVector && state.currentTopicVector.length > 0;
            const needsRefresh = state.topicChanged ||
                await this.topicManager.shouldRefreshCache(state.conversationId);

            if (needsRefresh && hasVector) {
                const retrievedMemories = await this.memoryRetriever.retrieveMemories(
                    state.userId,
                    state.currentTopicVector!,
                    5
                );
                memories = retrievedMemories.highlights;

                await this.topicManager.updateCachedHighlights(
                    state.conversationId,
                    memories
                );

                console.log('[ConversationGraph] Cache refreshed:', {
                    reason: state.topicChanged ? 'topic_changed' : 'centroid_drift',
                    memoryCount: memories.length
                });
            } else {
                memories = await this.topicManager.getCachedHighlights(state.conversationId);
            }

            return { retrievedMemories: memories };
        } catch (error) {
            console.error('[ConversationGraph] retrieveMemories failed, continuing without memories:', error);
            return { retrievedMemories: [] };
        }
    }

    // private async checkTopicFatigue(state: ConversationStateType) {
    //     await this.topicManager.updateTopicState(
    //         state.conversationId,
    //         state.currentTopicVector || [],
    //         state.messageLength
    //     );

    //     const topicState = await this.topicManager.getCurrentTopic(state.conversationId);
    //     const topicFatigue = topicState?.topicFatigue || 0;

    //     let fatigueGuidance = "";
    //     if (topicFatigue >= 0.75) {
    //         fatigueGuidance = "TOPIC CHANGE RECOMMENDED: Topic extensively discussed...";
    //     } else if (topicFatigue >= 0.50) {
    //         fatigueGuidance = "TOPIC FRESHNESS NEEDED: Topic thoroughly covered...";
    //     } else if (topicFatigue >= 0.25) {
    //         fatigueGuidance = "TOPIC ENGAGEMENT NOTE: Watch for user interest cues...";
    //     }

    //     return { topicFatigue, fatigueGuidance };
    // }

    private async generateResponse(state: ConversationStateType) {
        let contextSection = "";
        if (state.retrievedMemories.length > 0) {
            contextSection = `# RELEVANT MEMORIES FROM PAST CONVERSATIONS
${state.retrievedMemories.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Use these memories to provide continuity and personalization.
`;
        }

        // if (state.fatigueGuidance) {
        //     contextSection += `\n\n${state.fatigueGuidance}`;
        // }

        const recentMessages = state.messages.slice(-10);

        let messages = [...recentMessages];

        if (contextSection) {
            const firstSystemIndex = messages.findIndex(m => m instanceof SystemMessage);
            if (firstSystemIndex >= 0) {
                const existingContent = typeof messages[firstSystemIndex].content === 'string'
                    ? messages[firstSystemIndex].content
                    : JSON.stringify(messages[firstSystemIndex].content);
                messages[firstSystemIndex] = new SystemMessage(`${existingContent}\n\n${contextSection}`);
            } else {
                messages = [new SystemMessage(contextSection), ...messages];
            }
        }

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

        console.log('[ConversationGraph] Generated response:', {
            responseLength: content.length
        });

        return {
            response: content
        };
    }

    private async skipRAG(state: ConversationStateType) {
        return {
            messageCount: state.messageCount + 1
        };
    }


    public compile() {
        return this.graph.compile();
    }
}