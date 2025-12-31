import { Request, Response, NextFunction } from 'express';
import type { ChatCompletionRequest, Message } from '@naiber/shared';
import { RAGService } from '../services/RAGService.js';
import { ConversationResolver } from '../services/ConversationResolver.js';

export interface RAGRequest extends Request {
    ragContext?: {
        conversationId: string;
        userId: string;
        relevantMemories: string;
    };
}

export class RAGMiddleware {
    private ragService: RAGService;
    private conversationResolver: ConversationResolver;
    private enabled: boolean;

    constructor(ragService: RAGService, conversationResolver: ConversationResolver) {
        this.ragService = ragService;
        this.conversationResolver = conversationResolver;
        this.enabled = process.env.RAG_ENABLED !== 'false'; 
    }

    middleware = async (req: RAGRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!this.enabled) {
                console.log('[RAGMiddleware] RAG disabled, skipping');
                next();
                return;
            }

            const request: ChatCompletionRequest = req.body;

            console.log('[RAGMiddleware] DEBUG - Request keys:', Object.keys(req.body));
            console.log('[RAGMiddleware] DEBUG - Request.user:', (req.body as any).user);
            console.log('[RAGMiddleware] DEBUG - Request.user_id:', (req.body as any).user_id);
            console.log('[RAGMiddleware] DEBUG - First message:', request.messages?.[0]?.content?.substring(0, 200));

            if (!request.messages || request.messages.length === 0) {
                next();
                return;
            }

            const conversation = await this.conversationResolver.resolveConversation(request);

            if (!conversation) {
                console.log('[RAGMiddleware] Could not resolve conversation, skipping RAG');
                next();
                return;
            }

            console.log('[RAGMiddleware] Resolved conversation:', conversation.conversationId);

            const lastUserMessage = this.getLastUserMessage(request.messages);

            if (!lastUserMessage) {
                console.log('[RAGMiddleware] No user message found, skipping RAG');
                next();
                return;
            }

            const ragContext = await this.ragService.processMessage(
                conversation.conversationId,
                conversation.userId,
                lastUserMessage.content
            );

            if (ragContext.shouldInjectContext) {
                this.injectContextIntoMessages(request.messages, ragContext.relevantMemories);
                console.log('[RAGMiddleware] Injected context into system prompt');
            }

            req.ragContext = {
                conversationId: conversation.conversationId,
                userId: conversation.userId,
                relevantMemories: ragContext.relevantMemories
            };

            next();

        } catch (error) {
            console.error('[RAGMiddleware] Error in RAG middleware:', error);
            next();
        }
    };

    private injectContextIntoMessages(messages: Message[], context: string): void {
        const systemMessage = messages.find(m => m.role === 'system');

        if (systemMessage) {
            systemMessage.content += context;
        } else {
            messages.unshift({
                role: 'system',
                content: `You are nAIber, an empathetic AI companion.${context}`
            });
        }
    }

    private getLastUserMessage(messages: Message[]): Message | null {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                return messages[i];
            }
        }
        return null;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        console.log('[RAGMiddleware] RAG', enabled ? 'enabled' : 'disabled');
    }
}