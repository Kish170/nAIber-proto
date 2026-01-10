import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAIEmbeddings } from "@langchain/openai";
import { OpenAIClient } from "./OpenAIClient";

export interface VectorStoreConfigs {
    baseUrl: string;
    apiKey: string;
    collectionName: string;
    openAIKey: string;
}

export class VectorStoreClient {
    private vectorStore: QdrantVectorStore;

    constructor(config: VectorStoreConfigs) {
        const embeddings = new OpenAIEmbeddings({
            apiKey: config.openAIKey,
            modelName: "text-embedding-3-small"
        });
        this.vectorStore = new QdrantVectorStore(embeddings, {
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
}