import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { MemoryDocument } from './types.js';

export interface VectorStoreConfigs {
    baseUrl: string;
    apiKey: string;
    collectionName: string;
}

export class VectorStoreClient {
    private vectorStore: QdrantVectorStore;

    constructor(config: VectorStoreConfigs, embeddingModel: OpenAIEmbeddings) {
        this.vectorStore = new QdrantVectorStore(embeddingModel, {
            url: config.baseUrl,
            apiKey: config.apiKey,
            collectionName: config.collectionName,
        });
    }

    async searchByEmbedding(embedding: number[], userId: string, k: number = 5): Promise<MemoryDocument[]> {
        const results = await this.vectorStore.similaritySearchVectorWithScore(
            embedding,
            k,
            { must: [{ key: 'userId', match: { value: userId } }] }
        );

        return results.map(([doc, score]) => ({
            pageContent: doc.pageContent,
            metadata: doc.metadata,
            score,
        }));
    }
}
