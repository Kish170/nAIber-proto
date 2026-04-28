import { Router, Request, Response } from 'express';
import { LLMController } from '../controllers/LLMController.js';
import type { ChatCompletionRequest } from '@naiber/shared-clients';
import { RedisClient, OpenAIClient, TwilioClient } from '@naiber/shared-clients';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { SupervisorGraph } from '../graphs/SupervisorGraph.js';
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

const END_CALL_DELAY_MS = 10000;

async function scheduleCallEnd(conversationId: string): Promise<void> {
    setTimeout(async () => {
        try {
            const session = await RedisClient.getInstance().getJSON<{ callSid?: string }>(`session:${conversationId}`);
            const callSid = session?.callSid;

            if (!callSid) {
                console.warn('[LLM Route] No callSid found for conversation:', conversationId);
                return;
            }

            const twilioClient = new TwilioClient({
                accountSid: process.env.TWILIO_ACCOUNT_SID!,
                authToken: process.env.TWILIO_AUTH_TOKEN!
            });

            const result = await twilioClient.endCall(callSid);
            if (result.success) {
                console.log('[LLM Route] Call ended via Twilio for conversation:', conversationId);
            } else {
                console.error('[LLM Route] Failed to end call:', result.error);
            }
        } catch (err) {
            console.error('[LLM Route] Error ending call:', err);
        }
    }, END_CALL_DELAY_MS);
}

export function LLMRouter(checkpointer: BaseCheckpointSaver): Router {
    const router = Router();

    const redisClient = RedisClient.getInstance();
    const openAIClient = new OpenAIClient({
        apiKey: process.env.OPENAI_API_KEY!,
        baseUrl: process.env.OPENAI_BASE_URL
    });

    const supervisorGraph = new SupervisorGraph(
        openAIClient,
        redisClient,
        checkpointer
    );

    const requestTracker = new Map<string, { count: number; lastTimestamp: number; lastResponse?: string; lastMessageCount?: number }>();
    setInterval(() => {
        const now = Date.now();
        for (const [key, val] of requestTracker) {
            if (now - val.lastTimestamp > 60_000) requestTracker.delete(key);
        }
    }, 30_000);

    const inFlight = new Map<string, Promise<any>>();

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

            const lastMsg = request.messages[request.messages.length - 1];
            const lastContent = typeof lastMsg?.content === 'string'
                ? lastMsg.content.substring(0, 80)
                : JSON.stringify(lastMsg?.content)?.substring(0, 80);
            const msgRoles = request.messages.map(m => m.role).join(',');

            console.log('[LLM Route] Request params:', {
                model: request.model,
                stream: request.stream,
                messageCount: request.messages.length,
                roles: msgRoles,
                lastRole: lastMsg?.role,
                lastContent,
                timestamp: Date.now()
            });
            const reqBody = request as any;
            const userId: string | undefined = reqBody.user ?? reqBody.user_id ?? reqBody.elevenlabs_extra_body?.user_id;

            let conversationId: string | undefined;
            if (userId) {
                conversationId = await redisClient.get(`rag:user:${userId}`) ?? undefined;
                if (!conversationId) {
                    console.warn('[LLM Route] No active session found for userId:', userId);
                }
            }

            if (userId && conversationId) {
                const tracker = requestTracker.get(conversationId) || { count: 0, lastTimestamp: 0 };
                const gap = tracker.lastTimestamp ? Date.now() - tracker.lastTimestamp : 0;
                tracker.count++;
                tracker.lastTimestamp = Date.now();
                requestTracker.set(conversationId, tracker);
                console.log('[LLM Route] DEBUG request pattern:', {
                    conversationId,
                    requestNum: tracker.count,
                    msSinceLastRequest: gap,
                    messageCount: request.messages.length,
                    lastRole: lastMsg?.role,
                });
            }

            if (!userId || !conversationId) {
                console.log('[LLM Route] Could not resolve userId or conversationId, falling back to LLMController');
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

            const dedupTracker = requestTracker.get(conversationId);
            if (
                dedupTracker?.lastResponse &&
                dedupTracker.lastMessageCount === request.messages.length &&
                Date.now() - dedupTracker.lastTimestamp < 500
            ) {
                console.warn('[LLM Route] Duplicate request detected — returning cached response for:', conversationId);
                const cachedResult = { response: dedupTracker.lastResponse, isHealthCheckComplete: false, isCognitiveComplete: false };
                if (request.stream === true) {
                    const completionId = `chatcmpl-${Date.now()}`;
                    const created = Math.floor(Date.now() / 1000);
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created, model: request.model, choices: [{ index: 0, delta: { content: cachedResult.response }, finish_reason: null }] })}\n\n`);
                    res.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created, model: request.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
                    res.write('data: [DONE]\n\n');
                    res.end();
                } else {
                    res.status(200).json({ id: `chatcmpl-${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: request.model, choices: [{ index: 0, message: { role: 'assistant', content: cachedResult.response }, finish_reason: 'stop' }] });
                }
                return;
            }

            const langchainMessages = request.messages.map(msg => {
                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                if (msg.role === 'system') return new SystemMessage(content);
                if (msg.role === 'assistant') return new AIMessage(content);
                return new HumanMessage(content);
            });

            let result: any;
            if (inFlight.has(conversationId)) {
                console.warn('[LLM Route] In-flight duplicate detected — reusing existing execution:', conversationId);
                result = await inFlight.get(conversationId);
            } else {
                const graphPromise = supervisorGraph.graph.invoke({
                    messages: langchainMessages,
                    userId,
                    conversationId
                });
                inFlight.set(conversationId, graphPromise);
                try {
                    result = await graphPromise;
                } finally {
                    inFlight.delete(conversationId);
                }
            }

            console.log('[LLM Route] SupervisorGraph result:', {
                hasResponse: !!result.response,
                responseType: typeof result.response,
                responseLength: result.response?.length,
                responsePreview: result.response?.substring(0, 100)
            });

            const tracker = requestTracker.get(conversationId);
            if (tracker) {
                tracker.lastResponse = result.response;
                tracker.lastMessageCount = request.messages.length;
            }

            if (!result.response || typeof result.response !== 'string') {
                console.error('[LLM Route] Invalid response from SupervisorGraph:', result);
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

                if (result.isHealthCheckComplete || result.isCognitiveComplete) {
                    scheduleCallEnd(conversationId);
                }
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

                if (result.isHealthCheckComplete || result.isCognitiveComplete) {
                    scheduleCallEnd(conversationId);
                }
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