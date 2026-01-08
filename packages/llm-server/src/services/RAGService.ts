import { OpenAIClient, QdrantClient, RedisClient, EmbeddingService, TextPreprocessor } from '@naiber/shared';
import { IntentClassifier } from './IntentClassifier.js';
import { TopicManager } from './TopicManager.js';
import { MemoryRetriever } from './MemoryRetriever.js';

export interface RAGContext {
    relevantMemories: string;
    shouldInjectContext: boolean;
}

export class RAGService {
    private redisClient: RedisClient;
    private openAIClient: OpenAIClient;
    private qdrantClient: QdrantClient;
    private intentClassifier: IntentClassifier;
    private textPreprocessor: TextPreprocessor;
    private embeddingService: EmbeddingService;
    private topicManager: TopicManager;
    private memoryRetriever: MemoryRetriever;

    constructor(redisClient: RedisClient, openAIClient: OpenAIClient, qdrantClient: QdrantClient) {
        this.redisClient = redisClient;
        this.openAIClient = openAIClient;
        this.qdrantClient = qdrantClient;

        this.intentClassifier = new IntentClassifier();
        this.textPreprocessor = new TextPreprocessor();
        this.embeddingService = new EmbeddingService(
            this.openAIClient,
            this.redisClient,
            this.textPreprocessor
        );
        this.topicManager = new TopicManager(redisClient);
        this.memoryRetriever = new MemoryRetriever(qdrantClient);
    }

    async processMessage(conversationId: string, userId: string, userMessage: string): Promise<RAGContext> {
        try {
            console.log('[RAGService] Processing message for conversation:', conversationId);

            const intent = this.intentClassifier.classifyIntent(userMessage);

            if (!intent.shouldProcessRAG) {
                console.log('[RAGService] Skipping RAG - short/filler response');
                return {
                    relevantMemories: '',
                    shouldInjectContext: false
                };
            }

            const keyTerms = this.textPreprocessor.extractKeyTerms(userMessage);
            console.log('[RAGService] Key terms:', keyTerms.slice(0, 5));

            const result = await this.embeddingService.generateEmbedding(userMessage);
            const messageEmbedding = result.embedding;
            const topicChanged = await this.topicManager.detectTopicChange(conversationId, messageEmbedding, intent.messageLength);

            let relevantMemories = '';

            if (topicChanged) {
                console.log('[RAGService] Topic change detected, retrieving memories');

                // Reset fatigue when topic changes
                await this.topicManager.resetTopicFatigue(conversationId);

                const memories = await this.memoryRetriever.retrieveMemories(userId, messageEmbedding, 5);
                relevantMemories = this.memoryRetriever.formatMemoriesForContext(memories);
            }

            await this.topicManager.updateTopicState(
                conversationId,
                messageEmbedding,
                intent.messageLength
            );

            return {
                relevantMemories,
                shouldInjectContext: topicChanged && relevantMemories.length > 0
            };

        } catch (error) {
            console.error('[RAGService] Error in RAG pipeline:', error);
            return {
                relevantMemories: '',
                shouldInjectContext: false
            };
        }
    }
}