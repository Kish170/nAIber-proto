import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAIEmbeddings } from "@langchain/openai";

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

    async addMemories(highlights: string[], metadata: {userId: string; conversationId: string; conversationDate?: string;}) {
        const documents = highlights.map(highlight => ({
            pageContent: highlight,
            metadata
        }));

        await this.vectorStore.addDocuments(documents);
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