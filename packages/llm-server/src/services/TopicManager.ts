import cosine from 'compute-cosine-similarity';
import { RedisClient } from '@naiber/shared';
import { IntentClassifier } from './IntentClassifier.js';

export interface TopicState {
    currentTopicVector: number[];
    topicCentroidVector: number[];
    cachedHighlights: string[];
    messageLength: number;
    messageCount: number;
    topicStartedAt?: number;
    lastSimilarity?: number;
    cacheAnchorCentroid?: number[];    // centroid snapshot at last cache fill
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

        if (!currentTopic || !currentTopic.topicCentroidVector || currentTopic.topicCentroidVector.length === 0) {
            console.log('[TopicManager] No previous topic - treating as new topic');
            return true;
        }

        const similarity = cosine(currentTopic.topicCentroidVector, messageEmbedding);

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
            messageCount: currentTopic.messageCount || 0
        });

        return topicChanged;
    }

    async manageTopicState(conversationId: string, messageVector: number[], messageLength: number, isTopicChange: boolean): Promise<void> {
        const currentTopic = await this.getCurrentTopic(conversationId);

        let topicCentroidVector: number[];
        let messageCount: number;
        let cachedHighlights: string[];
        let topicStartedAt: number;

        if (isTopicChange || !currentTopic) {
            topicCentroidVector = messageVector;
            messageCount = 1;
            cachedHighlights = [];
            topicStartedAt = Date.now();
        } else {
            messageCount = (currentTopic.messageCount || 0) + 1;
            topicCentroidVector = this.calculateIncrementalCentroid(
                currentTopic.topicCentroidVector,
                messageVector,
                messageCount
            );
            cachedHighlights = currentTopic.cachedHighlights || [];
            topicStartedAt = currentTopic.topicStartedAt || Date.now();
        }

        const updatedTopic: TopicState = {
            currentTopicVector: messageVector,
            topicCentroidVector,
            cachedHighlights,
            messageLength,
            messageCount,
            topicStartedAt,
            lastSimilarity: currentTopic?.lastSimilarity
        };

        await this.redisClient.setJSON(
            `rag:topic:${conversationId}`,
            updatedTopic,
            3600
        );

        console.log('[TopicManager] Updated topic state', {
            conversationId,
            messageCount,
            isTopicChange,
            cachedHighlightsCount: cachedHighlights.length
        });
    }

    async updateCachedHighlights(conversationId: string, highlights: string[]): Promise<void> {
        const currentTopic = await this.getCurrentTopic(conversationId);
        if (currentTopic) {
            currentTopic.cachedHighlights = highlights;
            currentTopic.cacheAnchorCentroid = [...currentTopic.topicCentroidVector];
            await this.redisClient.setJSON(
                `rag:topic:${conversationId}`,
                currentTopic,
                3600
            );
        }
    }

    async shouldRefreshCache(conversationId: string): Promise<boolean> {
        const currentTopic = await this.getCurrentTopic(conversationId);
        if (!currentTopic?.cacheAnchorCentroid || !currentTopic.topicCentroidVector) {
            return true;
        }
        const similarity = cosine(currentTopic.cacheAnchorCentroid, currentTopic.topicCentroidVector);
        if (similarity === null || similarity === undefined) return true;
        const DRIFT_THRESHOLD = 0.88;
        const shouldRefresh = similarity < DRIFT_THRESHOLD;
        console.log('[TopicManager] Cache drift check:', {
            conversationId,
            similarity: similarity.toFixed(3),
            shouldRefresh
        });
        return shouldRefresh;
    }

    async getCachedHighlights(conversationId: string): Promise<string[]> {
        const currentTopic = await this.getCurrentTopic(conversationId);
        return currentTopic?.cachedHighlights || [];
    }

    async getCurrentTopic(conversationId: string): Promise<TopicState | null> {
        return await this.redisClient.getJSON<TopicState>(`rag:topic:${conversationId}`);
    }

    async clearTopicState(conversationId: string): Promise<void> {
        const pattern = `rag:topic:${conversationId}`;
        await this.redisClient.deleteByPattern(pattern);
        console.log('[TopicManager] Cleared topic state for conversation:', conversationId);
    }

    private calculateIncrementalCentroid(oldCentroid: number[], newVector: number[], messageCount: number): number[] {
        return oldCentroid.map((val, i) =>
            (val * (messageCount - 1) + newVector[i]) / messageCount
        );
    }
}