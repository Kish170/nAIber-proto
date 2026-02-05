import { BaseMessage } from "@langchain/core/messages";
import { ConversationGraph } from "../graphs/ConversationGraph.js";
import { AskHealthQuestionGraph } from "../graphs/AskHealthQuestionGraph.js";
import { ValidateHealthAnswerGraph } from "../graphs/ValidateHealthAnswerGraph.js";
import { ConversationStateType } from "../states/ConversationState.js";
import { OpenAIClient, EmbeddingService, RedisClient } from "@naiber/shared";
import { MemoryRetriever } from "../services/MemoryRetriever.js";
import { TopicManager } from "../services/TopicManager.js";
import { HealthCheckSessionManager } from "../services/HealthCheckSessionManager.js";

export class GraphSelectorAgent {
    private conversationGraph: ConversationGraph;
    private askHealthQuestionGraph: AskHealthQuestionGraph;
    private validateHealthAnswerGraph: ValidateHealthAnswerGraph;
    private compiledConversationGraph: any;
    private compiledAskHealthQuestionGraph: any;
    private compiledValidateHealthAnswerGraph: any;
    private sessionManager: HealthCheckSessionManager;
    private redisClient: RedisClient;

    constructor(
        openAIClient: OpenAIClient,
        embeddingService: EmbeddingService,
        memoryRetriever: MemoryRetriever,
        topicManager: TopicManager,
        redisClient: RedisClient,
        openAIKey: string
    ) {
        this.redisClient = redisClient;
        this.sessionManager = new HealthCheckSessionManager(redisClient);

        this.conversationGraph = new ConversationGraph(
            openAIKey,
            embeddingService,
            memoryRetriever,
            topicManager
        );
        this.askHealthQuestionGraph = new AskHealthQuestionGraph(
            openAIClient,
            this.sessionManager
        );
        this.validateHealthAnswerGraph = new ValidateHealthAnswerGraph(
            this.sessionManager
        );

        this.compiledConversationGraph = this.conversationGraph.compile();
        this.compiledAskHealthQuestionGraph = this.askHealthQuestionGraph.compile();
        this.compiledValidateHealthAnswerGraph = this.validateHealthAnswerGraph.compile();

        console.log('[GraphSelectorAgent] Initialized with compiled graphs and session manager');
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
            console.log('[GraphSelectorAgent] Health check call detected');

            const healthSession = await this.sessionManager.getSession(userId);

            if (!healthSession) {
                console.log('[GraphSelectorAgent] Initializing new health check session');
                await this.sessionManager.initializeSession(userId, conversationId);

                return await this.compiledAskHealthQuestionGraph.invoke({
                    messages: langchainMessages,
                    userId,
                    conversationId
                });
            } else if (!healthSession.isComplete) {
                console.log('[GraphSelectorAgent] Continuing health check session');

                const validateResult = await this.compiledValidateHealthAnswerGraph.invoke({
                    messages: langchainMessages,
                    userId,
                    conversationId
                });

                console.log('[GraphSelectorAgent] Validation completed:', {
                    needsNextQuestion: validateResult.needsNextQuestion,
                    isHealthCheckComplete: validateResult.isHealthCheckComplete
                });

                if (validateResult.needsNextQuestion) {
                    console.log('[GraphSelectorAgent] Asking next health check question');

                    return await this.compiledAskHealthQuestionGraph.invoke({
                        messages: langchainMessages,
                        userId,
                        conversationId
                    });
                }

                return validateResult;
            } else {
                // Health check complete
                console.log('[GraphSelectorAgent] Health check session already complete');
                return {
                    response: "Your health check for this session is complete. Thank you!",
                    isHealthCheckComplete: true
                } as ConversationStateType;
            }
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
}