import { OpenAIEmbeddings } from "@langchain/openai";
import { CacheBackedEmbeddings } from "@langchain/classic/embeddings/cache_backed";
// import { RedisVectorStore } from "@langchain/redis";
import { InMemoryStore } from "@langchain/core/stores";


export interface EmbeddingOptions {
    skipCache?: boolean;  
    cacheTTL?: number;   
}

export interface EmbeddingResult {
    embedding: number[];
    preprocessedText: string;
    fromCache: boolean;
}

export class EmbeddingService {
    private embeddings: CacheBackedEmbeddings;

    constructor(openAIKey: string) { 
        const underlyingEmbeddings = new OpenAIEmbeddings({
            apiKey: openAIKey,
            modelName: "text-embedding-3-small"
        });

        const inMemoryStore = new InMemoryStore();

        this.embeddings = CacheBackedEmbeddings.fromBytesStore(
            underlyingEmbeddings,
            inMemoryStore,
            { namespace: "embeddings:v1" }
        );
    }

    async embedQuery(text: string): Promise<number[]> {
        return await this.embeddings.embedQuery(text);
    }

    async embedDocuments(texts: string[]): Promise<number[][]> {
        return await this.embeddings.embedDocuments(texts);
    }
}