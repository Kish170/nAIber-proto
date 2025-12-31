import { OpenAIClient } from '../clients/OpenAIClient';
import { RedisClient } from '../clients/RedisClient';
import { TextPreprocessor } from './TextPreprocessor';

export interface EmbeddingOptions {
    skipCache?: boolean;  // default: false
    cacheTTL?: number;    // default: 3600
}

export interface EmbeddingResult {
    embedding: number[];
    preprocessedText: string;
    fromCache: boolean;
}

export class EmbeddingService {
    private openAIClient: OpenAIClient;
    private redisClient: RedisClient;
    private textPreprocessor: TextPreprocessor;

    constructor(openAIClient: OpenAIClient, redisClient: RedisClient, textPreprocessor: TextPreprocessor) {
        this.openAIClient = openAIClient;
        this.redisClient = redisClient;
        this.textPreprocessor = textPreprocessor;
    }

    async generateEmbedding(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
        const skipCache = options?.skipCache ?? false;
        const cacheTTL = options?.cacheTTL ?? 3600;

        const preprocessedText = this.textPreprocessor.getSemanticEssence(text);

        if (!skipCache) {
            const cacheKey = `embed:v1:${this.hashText(preprocessedText)}`;
            const cached = await this.getCachedEmbedding(cacheKey);

            if (cached) {
                console.log('[EmbeddingService] Using cached embedding');
                return {
                    embedding: cached,
                    preprocessedText,
                    fromCache: true
                };
            }
        }

        console.log('[EmbeddingService] Generating embedding');
        console.log('[EmbeddingService] Original:', text.substring(0, 50));
        console.log('[EmbeddingService] Preprocessed:', preprocessedText);

        const embedding = await this.openAIClient.generateEmbeddings(preprocessedText);

        if (!skipCache) {
            const cacheKey = `embed:v1:${this.hashText(preprocessedText)}`;
            await this.cacheEmbedding(cacheKey, embedding, cacheTTL);
        }

        return {
            embedding,
            preprocessedText,
            fromCache: false
        };
    }

    async generateEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult[]> {
        return Promise.all(texts.map(text => this.generateEmbedding(text, options)));
    }

    private async getCachedEmbedding(cacheKey: string): Promise<number[] | null> {
        return await this.redisClient.getJSON<number[]>(cacheKey);
    }

    private async cacheEmbedding(cacheKey: string, embedding: number[], ttl: number): Promise<void> {
        await this.redisClient.setJSON(cacheKey, embedding, ttl);
    }

    private hashText(text: string): string {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
}