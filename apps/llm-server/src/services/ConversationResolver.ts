import type { ChatCompletionRequest } from '@naiber/shared-clients';
import { RedisClient } from '@naiber/shared-clients';

export interface ResolvedConversation {
    conversationId: string;
    userId: string;
    phone: string;
    callSid: string;
}

export class ConversationResolver {
    private redisClient: RedisClient;

    constructor(redisClient: RedisClient) {
        this.redisClient = redisClient;
    }

    async resolveConversation(request: ChatCompletionRequest): Promise<ResolvedConversation | null> {
        try {
            const userId = (request as any).user || (request as any).user_id;
            if (!userId) {
                console.warn('[ConversationResolver] No userId in request — cannot resolve conversation');
                return null;
            }

            console.log('[ConversationResolver] Found userId in request:', userId);
            const conversationId = await this.redisClient.get(`rag:user:${userId}`);
            if (!conversationId) {
                console.warn('[ConversationResolver] No Redis mapping for userId:', userId);
                return null;
            }

            const conversation = await this.getConversationDetails(conversationId);
            if (!conversation) {
                console.warn('[ConversationResolver] No session details for conversationId:', conversationId);
                return null;
            }

            console.log('[ConversationResolver] Resolved via userId:', conversationId);
            return conversation;

        } catch (error) {
            console.error('[ConversationResolver] Error resolving conversation:', error);
            return null;
        }
    }

    private async getConversationDetails(conversationId: string): Promise<ResolvedConversation | null> {
        return await this.redisClient.getJSON<ResolvedConversation>(
            `session:${conversationId}`
        );
    }
}
