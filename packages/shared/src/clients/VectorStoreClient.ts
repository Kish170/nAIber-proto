import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAIEmbeddings } from "@langchain/openai";

export interface VectorStoreConfigs {
    baseUrl: string;
    apiKey: string;
    collectionName: string;
    openAIKey: string;
}

export class VectorStoreClient {
    private vectorStore: QdrantVectorStore;
    private embeddings: OpenAIEmbeddings;

    constructor(config: VectorStoreConfigs) {
        this.embeddings = new OpenAIEmbeddings({
            apiKey: config.openAIKey,
            modelName: "text-embedding-3-small"
        });
        this.vectorStore = new QdrantVectorStore(this.embeddings, {
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

        return await retriever._getRelevantDocuments(query);
    }

    async addMemories(highlights: string[], metadata: {userId: string; conversationId: string; conversationDate?: string;}) {
        const documents = highlights.map(highlight => ({
            pageContent: highlight,
            metadata
        }));

        await this.vectorStore.addDocuments(documents);
    }

    async embedQuery(query: string): Promise<number[]> {
        return await this.embeddings.embedQuery(query);
    }
}