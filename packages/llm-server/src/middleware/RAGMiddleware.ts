import { Request, Response, NextFunction } from 'express';
import type { ChatCompletionRequest, Message } from '@naiber/shared';
import { RAGService } from '../services/RAGService.js';
import { ConversationResolver } from '../services/ConversationResolver.js';
import { TopicManager } from '../services/TopicManager.js';

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
    private topicManager: TopicManager;
    private enabled: boolean;

    constructor(ragService: RAGService, conversationResolver: ConversationResolver, topicManager: TopicManager) {
        this.ragService = ragService;
        this.conversationResolver = conversationResolver;
        this.topicManager = topicManager;
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

            const topicState = await this.topicManager.getCurrentTopic(conversation.conversationId);
            const topicFatigue = topicState?.topicFatigue || 0;

            let contextToInject = ragContext.relevantMemories;

            const fatigueGuidance = this.getFatigueGuidance(topicFatigue);
            if (fatigueGuidance) {
                contextToInject += fatigueGuidance;
            }

            if (ragContext.shouldInjectContext || topicFatigue > 0.25) {
                this.injectContextIntoMessages(request.messages, contextToInject);
                console.log('[RAGMiddleware] Injected context', {
                    hasMemories: ragContext.shouldInjectContext,
                    topicFatigue: topicFatigue.toFixed(2)
                });
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
            systemMessage.content += `The following is memory/context related to the current topic of discussion which can be used to enhance the conversation as needed: ${context}`;
        } else {
            messages.unshift({
                role: 'system',
                content: `The following is memory/context related to the current topic of discussion which can be used to enhance the conversation as needed: ${context}`
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

    private getFatigueGuidance(fatigueScore: number): string {
        if (fatigueScore < 0.25) {
            return '';  
        }

        if (fatigueScore < 0.5) {
            return `\n\n# TOPIC ENGAGEMENT NOTE
Current topic has been discussed for a while. Watch for user interest cues. If engagement seems low, consider exploring related angles or gently offering to discuss something different.`;
        }

        if (fatigueScore < 0.75) {
            return `\n\n# TOPIC FRESHNESS NEEDED
This topic has been thoroughly covered. Look for natural opportunities to:
- Explore a related but different aspect
- Connect to user's other interests
- Gently ask if they'd like to discuss something else
Keep the transition smooth and natural.`;
        }

        return `\n\n# TOPIC CHANGE RECOMMENDED
This topic has been extensively discussed and may feel repetitive. Consider:
- Acknowledging what's been covered
- Suggesting a fresh topic from user's interests
- Asking directly if they'd like to explore something new
Make the transition feel natural and user-driven.`;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        console.log('[RAGMiddleware] RAG', enabled ? 'enabled' : 'disabled');
    }
}