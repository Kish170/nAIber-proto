import cosine from 'compute-cosine-similarity';
import { RedisClient } from '@naiber/shared';
import { IntentClassifier } from './IntentClassifier.js';

export interface TopicState {
    currentTopicVector: number[];
    messageLength: number;
    messageCount: number;         
    topicFatigue: number;        
    topicStartedAt?: number;        
    lastSimilarity?: number;       
}

export class TopicManager {
    private redisClient: RedisClient;
    private intentClassifier: IntentClassifier;

    constructor(redisClient: RedisClient) {
        this.redisClient = redisClient;
        this.intentClassifier = new IntentClassifier();
    }

    async detectTopicChange(conversationId: string, messageEmbedding: number[], messageLength: number): Promise<boolean> {
        const currentTopic = await this.getCurrentTopic(conversationId);

        if (!currentTopic || !currentTopic.currentTopicVector || currentTopic.currentTopicVector.length === 0) {
            console.log('[TopicManager] No previous topic - treating as new topic');
            return true;
        }

        const similarity = cosine(currentTopic.currentTopicVector, messageEmbedding);

        if (similarity === null || similarity === undefined) {
            console.warn('[TopicManager] Similarity calculation returned null/undefined');
            return true;
        }

        const mockClassification = { messageLength } as any;
        const threshold = this.intentClassifier.calculateSimilarityThreshold(mockClassification);

        const topicChanged = similarity < threshold;

        console.log('[TopicManager] Topic similarity check:', {
            similarity: similarity.toFixed(3),
            threshold: threshold.toFixed(3),
            topicChanged,
            messageLength,
            messageCount: currentTopic.messageCount || 0,
            topicFatigue: (currentTopic.topicFatigue || 0).toFixed(3)
        });

        return topicChanged;
    }

    async updateTopicState(conversationId: string, topicVector: number[], messageLength: number): Promise<void> {
        const currentState = await this.getCurrentTopic(conversationId);

        // Increment message count or initialize to 1
        const messageCount = (currentState?.messageCount || 0) + 1;

        // Calculate fatigue score
        const topicFatigue = this.calculateTopicFatigue(messageCount);

        const updatedTopic: TopicState = {
            currentTopicVector: topicVector,
            messageLength,
            messageCount,
            topicFatigue,
            topicStartedAt: currentState?.topicStartedAt || Date.now(),
            lastSimilarity: currentState?.lastSimilarity
        };

        await this.redisClient.setJSON(
            `rag:topic:${conversationId}`,
            updatedTopic,
            3600
        );

        console.log('[TopicManager] Updated topic state', {
            conversationId,
            messageCount,
            topicFatigue: topicFatigue.toFixed(3)
        });
    }

    async getCurrentTopic(conversationId: string): Promise<TopicState | null> {
        return await this.redisClient.getJSON<TopicState>(`rag:topic:${conversationId}`);
    }

    async resetTopicFatigue(conversationId: string): Promise<void> {
        const currentState = await this.getCurrentTopic(conversationId);

        if (currentState) {
            const resetTopic: TopicState = {
                ...currentState,
                messageCount: 0,
                topicFatigue: 0,
                topicStartedAt: Date.now(),
                lastSimilarity: undefined
            };

            await this.redisClient.setJSON(
                `rag:topic:${conversationId}`,
                resetTopic,
                3600
            );

            console.log('[TopicManager] Reset topic fatigue for conversation:', conversationId);
        }
    }

    async clearTopicState(conversationId: string): Promise<void> {
        const pattern = `rag:topic:${conversationId}`;
        await this.redisClient.deleteByPattern(pattern);
        console.log('[TopicManager] Cleared topic state for conversation:', conversationId);
    }

    private calculateTopicFatigue(messageCount: number): number {
        const baseFatigue = Math.pow(messageCount / 15, 1.8);
        return Math.min(1.0, baseFatigue);
    }
}