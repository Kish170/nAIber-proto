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
    private payloadIndexEnsured = false;

    constructor(config: VectorStoreConfigs, embeddingModel: OpenAIEmbeddings) {
        this.vectorStore = new QdrantVectorStore(embeddingModel, {
            url: config.baseUrl,
            apiKey: config.apiKey,
            collectionName: config.collectionName,
        });
    }
    private async ensurePayloadIndex(): Promise<void> {
        if (this.payloadIndexEnsured) return;
        const vs = this.vectorStore as any;
        try {
            await vs.client.createPayloadIndex(vs.collectionName, {
                field_name: 'metadata.userId',
                field_schema: 'keyword',
                wait: true,
            });
            console.log('[VectorStoreClient] payload index on metadata.userId ready');
        } catch (err: any) {
            if (!err?.message?.toLowerCase().includes('already exist')) {
                throw err;
            }
        }
        this.payloadIndexEnsured = true;
    }

    searchByEmbedding = traceable(
        async (embedding: number[], userId: string, k: number = 5): Promise<MemoryDocument[]> => {
            await this.ensurePayloadIndex();

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
