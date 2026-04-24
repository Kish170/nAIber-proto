import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';
import { traceable } from 'langsmith/traceable';
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

    searchByEmbedding = traceable(
        async (embedding: number[], userId: string, k: number = 5): Promise<MemoryDocument[]> => {
            const results = await this.vectorStore.similaritySearchVectorWithScore(
                embedding,
                k,
                { must: [{ key: 'metadata.userId', match: { value: userId } }] }
            );

            const docs = results.map(([doc, score]) => ({
                pageContent: doc.pageContent,
                metadata: doc.metadata,
                score,
            }));

            console.log(`[VectorStoreClient] searchByEmbedding userId=${userId} k=${k} results=${docs.length} scores=[${docs.map(d => d.score.toFixed(4)).join(', ')}]`);

            return docs;
        },
        { name: 'qdrant_vector_search', run_type: 'retriever' }
    );
}
