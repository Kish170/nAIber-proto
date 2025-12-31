import cosine from 'compute-cosine-similarity';
import { RedisClient } from '@naiber/shared';
import { IntentClassifier } from './IntentClassifier.js';

export interface TopicState {
    currentTopicVector: number[];
    messageLength: number; 
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
            messageLength
        });

        return topicChanged;
    }

    async updateTopicState(conversationId: string, topicVector: number[], messageLength: number): Promise<void> {
        const updatedTopic: TopicState = {
            currentTopicVector: topicVector,
            messageLength
        };

        await this.redisClient.setJSON(
            `rag:topic:${conversationId}`,
            updatedTopic,
            3600 
        );

        console.log('[TopicManager] Updated topic state for conversation:', conversationId);
    }

    async getCurrentTopic(conversationId: string): Promise<TopicState | null> {
        return await this.redisClient.getJSON<TopicState>(`rag:topic:${conversationId}`);
    }

    async clearTopicState(conversationId: string): Promise<void> {
        const pattern = `rag:topic:${conversationId}`;
        await this.redisClient.deleteByPattern(pattern);
        console.log('[TopicManager] Cleared topic state for conversation:', conversationId);
    }
}