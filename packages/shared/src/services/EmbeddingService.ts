import { CacheBackedEmbeddings } from "@langchain/classic/embeddings/cache_backed";
import { InMemoryStore, BaseStore } from "@langchain/core/stores";
import { OpenAIClient } from "../clients/OpenAIClient.js";
import { TextPreprocessor } from "./TextPreprocessor.js";


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
    private textPreprocessor: TextPreprocessor;

    constructor(openAIClient: OpenAIClient, textPreprocessor?: TextPreprocessor, store?: BaseStore<string, Uint8Array>) {
        const underlyingEmbeddings = openAIClient.returnEmbeddingModel();

        const bytesStore = store ?? new InMemoryStore();

        this.embeddings = CacheBackedEmbeddings.fromBytesStore(
            underlyingEmbeddings,
            bytesStore,
            { namespace: "embeddings:v1" }
        );

        this.textPreprocessor = textPreprocessor || new TextPreprocessor();
    }

    async embedQuery(text: string): Promise<number[]> {
        return await this.embeddings.embedQuery(text);
    }

    async embedDocuments(texts: string[]): Promise<number[][]> {
        return await this.embeddings.embedDocuments(texts);
    }

    async generateEmbedding(text: string): Promise<EmbeddingResult> {
        const preprocessedText = this.textPreprocessor.getSemanticEssence(text);
        const textToEmbed = preprocessedText.length > 0 ? preprocessedText : text;

        const embedding = await this.embeddings.embedQuery(textToEmbed);

        return {
            embedding,
            preprocessedText: textToEmbed,
            fromCache: false
        };
    }

    async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
        const preprocessedTexts = texts.map(text => {
            const processed = this.textPreprocessor.getSemanticEssence(text);
            return processed.length > 0 ? processed : text;
        });

        const embeddings = await this.embeddings.embedDocuments(preprocessedTexts);

        return embeddings.map((embedding, index) => ({
            embedding,
            preprocessedText: preprocessedTexts[index],
            fromCache: false
        }));
    }
}