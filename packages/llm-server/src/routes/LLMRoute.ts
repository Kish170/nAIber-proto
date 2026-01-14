import { Router, Request, Response } from 'express';
import { LLMController } from '../controllers/LLMController.js';
import type { ChatCompletionRequest } from '@naiber/shared';
import { RedisClient, OpenAIClient, VectorStoreClient, EmbeddingService } from '@naiber/shared';
import { ConversationResolver } from '../services/ConversationResolver.js';
import { TopicManager } from '../services/TopicManager.js';
import { MemoryRetriever } from '../services/MemoryRetriever.js';
import { ConversationGraph } from '../graphs/ConversationGraph.js';
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

export function LLMRouter(): Router {
    const router = Router();

    const redisClient = RedisClient.getInstance();
    const openAIClient = new OpenAIClient({
        apiKey: process.env.OPENAI_API_KEY!,
        baseUrl: process.env.OPENAI_BASE_URL
    });

    const embeddingModel = openAIClient.returnEmbeddingModel();

    const vectorStore = new VectorStoreClient({
        baseUrl: process.env.QDRANT_URL!,
        apiKey: process.env.QDRANT_API_KEY!,
        collectionName: process.env.QDRANT_COLLECTION!
    }, embeddingModel);

    const embeddingService = new EmbeddingService(openAIClient);
    const memoryRetriever = new MemoryRetriever(vectorStore);
    const topicManager = new TopicManager(redisClient);
    const conversationResolver = new ConversationResolver(redisClient);

    const conversationGraph = new ConversationGraph(
        process.env.OPENAI_API_KEY!,
        embeddingService,
        memoryRetriever,
        topicManager
    ).compile();

    const conversationGraphHandler = async (req: Request, res: Response) => {
        try {
            const request: ChatCompletionRequest = req.body;

            if (!request.messages || !request.model) {
                res.status(400).json({
                    error: {
                        message: 'Missing required fields: messages and model',
                        type: 'invalid_request_error'
                    }
                });
                return;
            }

            const conversation = await conversationResolver.resolveConversation(request);

            if (!conversation) {
                console.log('[LLM Route] Could not resolve conversation, falling back to LLMController');
                const controller = new LLMController();
                const completion = await controller.chatCompletion(request);
                res.json(completion);
                return;
            }

            const langchainMessages = request.messages.map(msg => {
                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                if (msg.role === 'system') return new SystemMessage(content);
                if (msg.role === 'assistant') return new AIMessage(content);
                return new HumanMessage(content);
            });

            const result = await conversationGraph.invoke({
                messages: langchainMessages,
                userId: conversation.userId,
                conversationId: conversation.conversationId
            });

            const completion = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: request.model,
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: result.response
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            };

            res.json(completion);

        } catch (error) {
            console.error('[LLM Route] Error:', error);

            if (!res.headersSent) {
                res.status(500).json({
                    error: {
                        message: error instanceof Error ? error.message : 'Internal server error',
                        type: 'api_error'
                    }
                });
            }
        }
    };

    router.post("/v1/chat/completions", conversationGraphHandler);
    router.post("/chat/completions", conversationGraphHandler);

    return router;
}