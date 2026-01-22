import { BaseMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ConversationGraph } from "../graphs/ConversationGraph.js";
import { AskHealthQuestionGraph } from "../graphs/AskHealthQuestionGraph.js";
import { ValidateHealthAnswerGraph } from "../graphs/ValidateHealthAnswerGraph.js";
import { ConversationStateType } from "../states/ConversationState.js";
import { OpenAIClient, EmbeddingService, RedisClient } from "@naiber/shared";
import { MemoryRetriever } from "../services/MemoryRetriever.js";
import { TopicManager } from "../services/TopicManager.js";
import { HealthCheckSessionManager } from "../services/HealthCheckSessionManager.js";
import { createDetectEndOfCallTool } from "../tools/controller/GeneralTools.js";

export class GraphSelectorAgent {
    private conversationGraph: ConversationGraph;
    private askHealthQuestionGraph: AskHealthQuestionGraph;
    private validateHealthAnswerGraph: ValidateHealthAnswerGraph;
    private compiledConversationGraph: any;
    private compiledAskHealthQuestionGraph: any;
    private compiledValidateHealthAnswerGraph: any;
    private detectEndOfCallTool: DynamicStructuredTool;
    private sessionManager: HealthCheckSessionManager;

    constructor(
        openAIClient: OpenAIClient,
        embeddingService: EmbeddingService,
        memoryRetriever: MemoryRetriever,
        topicManager: TopicManager,
        redisClient: RedisClient,
        openAIKey: string
    ) {
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

        const chatModel = openAIClient.returnChatModel();
        this.detectEndOfCallTool = createDetectEndOfCallTool(chatModel as any);

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

        const hasActiveSession = await this.sessionManager.hasActiveSession(userId);

        if (hasActiveSession) {
            console.log('[GraphSelectorAgent] Active health check session found, validating answer');

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
        }

        const result = await this.compiledConversationGraph.invoke({
            messages: langchainMessages,
            userId,
            conversationId
        });

        console.log('[GraphSelectorAgent] ConversationGraph completed:', {
            hasResponse: !!result.response,
            isEndCall: result.isEndCall
        });

        const lastMessage = langchainMessages[langchainMessages.length - 1];
        const lastMessageContent = typeof lastMessage.content === 'string'
            ? lastMessage.content
            : JSON.stringify(lastMessage.content);

        const detection = await this.detectEndOfCallTool.invoke({
            lastMessage: lastMessageContent
        });

        console.log('[GraphSelectorAgent] End-call detection result:', detection);

        if (detection.detected || result.isEndCall) {
            console.log('[GraphSelectorAgent] End call detected, initializing health check session');

            await this.sessionManager.initializeSession(userId, conversationId);

            console.log('[GraphSelectorAgent] Asking first health check question');

            return await this.compiledAskHealthQuestionGraph.invoke({
                messages: langchainMessages,
                userId,
                conversationId
            });
        }

        return result;
    }
}