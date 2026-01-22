import type { ChatCompletionRequest, Message } from '@naiber/shared';
import { RedisClient } from '@naiber/shared';

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
            if (userId) {
                console.log('[ConversationResolver] Found userId in request:', userId);
                const conversationId = await this.redisClient.get(`rag:user:${userId}`);
                if (conversationId) {
                    const conversation = await this.getConversationDetails(conversationId);
                    if (conversation) {
                        console.log('[ConversationResolver] Resolved via userId:', conversationId);
                        return conversation;
                    }
                }
            }

            const extractedUserId = this.extractUserIdFromMessages(request.messages);
            if (extractedUserId) {
                console.log('[ConversationResolver] Extracted userId from system prompt:', extractedUserId);
                const conversationId = await this.redisClient.get(`rag:user:${extractedUserId}`);
                if (conversationId) {
                    const conversation = await this.getConversationDetails(conversationId);
                    if (conversation) {
                        console.log('[ConversationResolver] Resolved via extracted userId:', conversationId);
                        return conversation;
                    }
                } else {
                    console.warn('[ConversationResolver] userId found in prompt but no Redis mapping:', extractedUserId);
                }
            } else {
                console.warn('[ConversationResolver] Could not extract userId from system prompt');
            }

            const phone = this.extractPhoneFromMessages(request.messages);
            if (phone) {
                console.log('[ConversationResolver] Extracted phone from system prompt:', phone);
                const conversationId = await this.redisClient.get(`rag:phone:${phone}`);
                if (conversationId) {
                    const conversation = await this.getConversationDetails(conversationId);
                    if (conversation) {
                        console.log('[ConversationResolver] Resolved via phone:', conversationId);
                        return conversation;
                    }
                } else {
                    console.warn('[ConversationResolver] Phone found in prompt but no Redis mapping:', phone);
                }
            } else {
                console.warn('[ConversationResolver] Could not extract phone from system prompt');
            }

            console.warn('[ConversationResolver] Could not resolve conversation - no valid identifiers found');
            return null;

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

    private extractPhoneFromMessages(messages: Message[]): string | null {
        const systemMessage = messages.find(m => m.role === 'system');
        if (!systemMessage) return null;

        const phoneMatch = systemMessage.content.match(/phone[:\s]+(\+?[\d\s\-()]+)/i);
        if (phoneMatch) {
            return phoneMatch[1].replace(/[\s\-()]/g, '');
        }

        return null;
    }

    private extractUserIdFromMessages(messages: Message[]): string | null {
        const systemMessage = messages.find(m => m.role === 'system');
        if (!systemMessage) return null;

        const userIdMatch = systemMessage.content.match(/user\s*ID[:\s]+([a-f0-9\-]+)/i);
        if (userIdMatch) {
            return userIdMatch[1];
        }

        return null;
    }
}