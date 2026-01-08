import { Router, Request, Response } from 'express';
import { LLMController } from '../controllers/LLMController.js';
import type { ChatCompletionRequest } from '@naiber/shared';
import { RedisClient, OpenAIClient, QdrantClient } from '@naiber/shared';
import { RAGService } from '../services/RAGService.js';
import { ConversationResolver } from '../services/ConversationResolver.js';
import { RAGMiddleware } from '../middleware/RAGMiddleware.js';
import { TopicManager } from '../services/TopicManager.js';

export function LLMRouter(): Router {
    const router = Router();

    const redisClient = RedisClient.getInstance();
    const openAIClient = new OpenAIClient({
        apiKey: process.env.OPENAI_API_KEY!,
        baseUrl: process.env.OPENAI_BASE_URL
    });
    const qdrantClient = new QdrantClient({
        baseUrl: process.env.QDRANT_URL!,
        apiKey: process.env.QDRANT_API_KEY!,
        collectionName: process.env.QDRANT_COLLECTION!
    });

    const ragService = new RAGService(redisClient, openAIClient, qdrantClient);
    const conversationResolver = new ConversationResolver(redisClient);
    const topicManager = new TopicManager(redisClient);
    const ragMiddleware = new RAGMiddleware(ragService, conversationResolver, topicManager);

    const chatCompletionHandler = async (req: Request, res: Response) => {
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

            const controller = new LLMController();

            if (request.stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                const stream = await controller.streamChatCompletion(request);

                for await (const chunk of stream) {
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                }

                res.write('data: [DONE]\n\n');
                res.end();
            } else {
                const completion = await controller.chatCompletion(request);
                res.json(completion);
            }

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

    router.post("/v1/chat/completions", ragMiddleware.middleware, chatCompletionHandler);
    router.post("/chat/completions", ragMiddleware.middleware, chatCompletionHandler);

    return router;
}