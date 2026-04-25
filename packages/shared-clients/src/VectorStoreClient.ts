import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';
import { traceable } from 'langsmith/traceable';

export interface VectorStoreConfigs {
    baseUrl: string;
    apiKey: string;
    collectionName: string;
}

export interface HighlightEntry {
    text: string;
    embedding: number[];
    id: string;
}

export interface MemorySearchResult {
    pageContent: string;
    metadata: Record<string, unknown>;
    score: number;
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

    async searchMemories(query: string, userId: string, k: number = 5) {
        await this.ensurePayloadIndex();
        const retriever = this.vectorStore.asRetriever({
            k,
            filter: { must: [{ key: 'metadata.userId', match: { value: userId } }] },
            searchType: 'similarity',
        });
        return await retriever.invoke(query);
    }

    async addMemories(
        highlights: string[],
        metadata: { userId: string; conversationId: string; createdAt?: string; summaryId?: string }
    ): Promise<void> {
        const documents = highlights.map(highlight => ({
            pageContent: highlight,
            metadata,
        }));
        await this.vectorStore.addDocuments(documents);
    }

    async addMemoriesWithIds(
        entries: HighlightEntry[],
        metadata: { userId: string; conversationId: string; createdAt?: string; summaryId?: string }
    ): Promise<void> {
        await this.ensurePayloadIndex();
        await this.vectorStore.addVectors(
            entries.map(e => e.embedding),
            entries.map(e => ({ pageContent: e.text, metadata: { ...metadata, qdrantPointId: e.id } })),
            { ids: entries.map(e => e.id) }
        );

        const ids = entries.map(e => e.id);
        const vs = this.vectorStore as any;
        const retrieved: { id: string }[] = await vs.client.retrieve(vs.collectionName, {
            ids,
            with_payload: false,
            with_vector: false,
        });
        const storedIds = new Set(retrieved.map(p => p.id));
        const missing = ids.filter(id => !storedIds.has(id));
        if (missing.length > 0) {
            throw new Error(
                `[VectorStoreClient] ${missing.length}/${ids.length} points missing after upsert` +
                ` — ids: ${missing.join(', ')}`
            );
        }
        console.log(`[VectorStoreClient] addMemoriesWithIds: verified ${ids.length}/${ids.length} points in Qdrant`);
    }

    searchByEmbedding = traceable(
        async (embedding: number[], userId: string, k: number = 5): Promise<MemorySearchResult[]> => {
            await this.ensurePayloadIndex();
            const results = await this.vectorStore.similaritySearchVectorWithScore(
                embedding,
                k,
                { must: [{ key: 'metadata.userId', match: { value: userId } }] }
            );

            const docs = results.map(([doc, score]) => ({
                pageContent: doc.pageContent,
                metadata: doc.metadata as Record<string, unknown>,
                score,
            }));

            console.log(`[VectorStoreClient] searchByEmbedding userId=${userId} k=${k} results=${docs.length} scores=[${docs.map(d => d.score.toFixed(4)).join(', ')}]`);

            return docs;
        },
        { name: 'qdrant_vector_search', run_type: 'retriever' }
    );
}
