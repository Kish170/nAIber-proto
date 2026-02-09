import { BaseMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ConversationGraph } from "../graphs/ConversationGraph.js";
import { HealthCheckGraph } from "../graphs/HealthCheckGraph.js";
import { ConversationStateType } from "../states/ConversationState.js";
import { OpenAIClient, EmbeddingService, RedisClient } from "@naiber/shared";
import { MemoryRetriever } from "../services/MemoryRetriever.js";
import { TopicManager } from "../services/TopicManager.js";

export class GraphSelectorAgent {
    private conversationGraph: ConversationGraph;
    private healthCheckGraph: HealthCheckGraph;
    private compiledConversationGraph: any;
    private redisClient: RedisClient;

    constructor(
        openAIClient: OpenAIClient,
        embeddingService: EmbeddingService,
        memoryRetriever: MemoryRetriever,
        topicManager: TopicManager,
        redisClient: RedisClient,
        openAIKey: string,
        checkpointer: BaseCheckpointSaver
    ) {
        this.redisClient = redisClient;

        this.conversationGraph = new ConversationGraph(
            openAIKey,
            embeddingService,
            memoryRetriever,
            topicManager
        );
        this.healthCheckGraph = new HealthCheckGraph(openAIClient, checkpointer);

        this.compiledConversationGraph = this.conversationGraph.compile();

        console.log('[GraphSelectorAgent] Initialized with compiled graphs');
    }

    async processConversation(
        langchainMessages: BaseMessage[],
        userId: string,
        conversationId: string
    ): Promise<ConversationStateType> {
        console.log('[GraphSelectorAgent] Processing conversation:', {
            userId,
            conversationId,
            messageCount: langchainMessages.length
        });

        const session = await this.redisClient.getJSON<any>(`session:${conversationId}`);

        if (!session) {
            console.log('[GraphSelectorAgent] No session found, defaulting to general conversation');
            return await this.compiledConversationGraph.invoke({
                messages: langchainMessages,
                userId,
                conversationId
            });
        }

        console.log('[GraphSelectorAgent] Session callType:', session.callType);

        if (session.callType === 'health_check') {
            return await this.handleHealthCheck(langchainMessages, userId, conversationId);
        } else {
            console.log('[GraphSelectorAgent] General conversation detected');

            const result = await this.compiledConversationGraph.invoke({
                messages: langchainMessages,
                userId,
                conversationId
            });

            console.log('[GraphSelectorAgent] ConversationGraph completed:', {
                hasResponse: !!result.response
            });

            return result;
        }
    }

    private async handleHealthCheck(
        langchainMessages: BaseMessage[],
        userId: string,
        conversationId: string
    ): Promise<ConversationStateType> {
        const threadId = `health_check:${userId}:${conversationId}`;
        const config = { configurable: { thread_id: threadId } };

        console.log('[GraphSelectorAgent] Health check call detected, threadId:', threadId);

        const currentState = await this.healthCheckGraph.graph.getState(config);

        if (!currentState.values || Object.keys(currentState.values).length === 0) {
            console.log('[GraphSelectorAgent] Starting new health check');

            const result = await this.healthCheckGraph.graph.invoke(
                { messages: langchainMessages, userId, conversationId },
                config
            );

            return {
                response: result.response,
                isHealthCheckComplete: result.isHealthCheckComplete ?? false
            } as ConversationStateType;
        } else if (currentState.next && currentState.next.length > 0) {
            console.log('[GraphSelectorAgent] Resuming health check at:', currentState.next);

            const lastMessage = langchainMessages[langchainMessages.length - 1];
            const userAnswer = typeof lastMessage.content === 'string'
                ? lastMessage.content
                : JSON.stringify(lastMessage.content);

            const result = await this.healthCheckGraph.graph.invoke(
                new Command({ resume: userAnswer }),
                config
            );

            return {
                response: result.response,
                isHealthCheckComplete: result.isHealthCheckComplete ?? false
            } as ConversationStateType;
        } else {
            console.log('[GraphSelectorAgent] Health check already complete');
            return {
                response: "Your health check for this session is complete. Thank you!",
                isHealthCheckComplete: true
            } as ConversationStateType;
        }
    }
}
