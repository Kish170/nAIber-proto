import { Router, Request, Response } from 'express';
import { LLMController } from '../controllers/LLMController.js';
import type { ChatCompletionRequest } from '@naiber/shared';
import { RedisClient, OpenAIClient, VectorStoreClient, EmbeddingService } from '@naiber/shared';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { ConversationResolver } from '../services/ConversationResolver.js';
import { TopicManager } from '../services/TopicManager.js';
import { MemoryRetriever } from '../services/MemoryRetriever.js';
import { SupervisorGraph } from '../graphs/SupervisorGraph.js';
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

export function LLMRouter(checkpointer: BaseCheckpointSaver): Router {
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

    const supervisorGraph = new SupervisorGraph(
        openAIClient,
        embeddingService,
        memoryRetriever,
        topicManager,
        redisClient,
        process.env.OPENAI_API_KEY!,
        checkpointer
    );

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

            console.log('[LLM Route] Request params:', {
                model: request.model,
                stream: request.stream,
                messageCount: request.messages.length
            });

            const conversation = await conversationResolver.resolveConversation(request);

            if (!conversation) {
                console.log('[LLM Route] Could not resolve conversation, falling back to LLMController');
                const controller = new LLMController();

                if (request.stream === true) {
                    const stream = await controller.streamChatCompletion(request);

                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');

                    for await (const chunk of stream) {
                        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }

                    res.write('data: [DONE]\n\n');
                    res.end();
                } else {
                    const completion = await controller.chatCompletion(request);
                    res.json(completion);
                }
                return;
            }

            const langchainMessages = request.messages.map(msg => {
                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                if (msg.role === 'system') return new SystemMessage(content);
                if (msg.role === 'assistant') return new AIMessage(content);
                return new HumanMessage(content);
            });

            const result = await supervisorGraph.graph.invoke({
                messages: langchainMessages,
                userId: conversation.userId,
                conversationId: conversation.conversationId
            });

            console.log('[LLM Route] ConversationGraph result:', {
                hasResponse: !!result.response,
                responseType: typeof result.response,
                responseLength: result.response?.length,
                responsePreview: result.response?.substring(0, 100)
            });

            if (!result.response || typeof result.response !== 'string') {
                console.error('[LLM Route] Invalid response from ConversationGraph:', result);
                res.status(500).json({
                    error: {
                        message: 'Failed to generate valid response',
                        type: 'api_error'
                    }
                });
                return;
            }

            if (request.stream === true) {
                console.log('[LLM Route] Returning SSE streaming format');

                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                const completionId = `chatcmpl-${Date.now()}`;
                const created = Math.floor(Date.now() / 1000);

                res.write(`data: ${JSON.stringify({
                    id: completionId,
                    object: 'chat.completion.chunk',
                    created: created,
                    model: request.model,
                    choices: [{
                        index: 0,
                        delta: { content: result.response },
                        finish_reason: null
                    }]
                })}\n\n`);

                res.write(`data: ${JSON.stringify({
                    id: completionId,
                    object: 'chat.completion.chunk',
                    created: created,
                    model: request.model,
                    choices: [{
                        index: 0,
                        delta: {},
                        finish_reason: 'stop'
                    }]
                })}\n\n`);

                res.write('data: [DONE]\n\n');
                res.end();

                console.log('[LLM Route] SSE stream completed');
            } else {
                console.log('[LLM Route] Returning standard JSON format');

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
                    }]
                };

                res.setHeader('Content-Type', 'application/json');
                res.status(200).json(completion);
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

    router.post("/v1/chat/completions", conversationGraphHandler);
    router.post("/chat/completions", conversationGraphHandler);

    return router;
}