import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAIEmbeddings } from "@langchain/openai";

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

export class VectorStoreClient {
    private vectorStore: QdrantVectorStore;

    constructor(config: VectorStoreConfigs, embeddingModel: OpenAIEmbeddings) {
        this.vectorStore = new QdrantVectorStore(embeddingModel, {
            url: config.baseUrl,
            apiKey: config.apiKey,
            collectionName: config.collectionName
        });
    }

    async searchMemories(query: string, userId: string, k: number = 5) {
        const retriever = this.vectorStore.asRetriever({
            k,
            filter: { must: [{ key: "userId", match: { value: userId } }] },
            searchType: "similarity",
        });

        return await retriever.invoke(query);
    }

    async addMemories(highlights: string[], metadata: {userId: string; conversationId: string; createdAt?: string; summaryId?: string;}) {
        const documents = highlights.map(highlight => ({
            pageContent: highlight,
            metadata
        }));

        await this.vectorStore.addDocuments(documents);
    }

    async addMemoriesWithIds(
        entries: HighlightEntry[],
        metadata: { userId: string; conversationId: string; createdAt?: string; summaryId?: string }
    ): Promise<void> {
        await this.vectorStore.addVectors(
            entries.map(e => e.embedding),
            entries.map(e => ({ pageContent: e.text, metadata: { ...metadata, qdrantPointId: e.id } })),
            { ids: entries.map(e => e.id) }
        );
    }

    async searchByEmbedding(embedding: number[], userId: string, k: number = 5) {
        const results = await this.vectorStore.similaritySearchVectorWithScore(
            embedding,
            k,
            { must: [{ key: "userId", match: { value: userId } }] }
        );

        return results.map(([doc, score]) => ({
            pageContent: doc.pageContent,
            metadata: doc.metadata,
            score
        }));
    }
}