import { z } from 'zod';
import { OpenAIClient } from '@naiber/shared-clients';
import { EmbeddingService } from '@naiber/shared-services';
import { VectorStoreClient } from '../../rag/VectorStoreClient.js';
import { GraphQueryRepository } from '../../rag/GraphQueryRepository.js';
import { KGRetrievalService } from '../../rag/KGRetrievalService.js';

export const retrieveMemoriesSchema = {
    query: z.string().describe('Current conversation query or topic to find memories for'),
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

let embeddingService: EmbeddingService | null = null;
let vectorStoreClient: VectorStoreClient | null = null;
let kgRetrievalService: KGRetrievalService | null = null;

function getServices(): { embeddingService: EmbeddingService; vectorStoreClient: VectorStoreClient; kgRetrievalService: KGRetrievalService } {
    if (!embeddingService) {
        embeddingService = new EmbeddingService(
            OpenAIClient.getInstance({
                apiKey: process.env.OPENAI_API_KEY!,
                baseUrl: process.env.OPENAI_BASE_URL,
            })
        );
    }

    if (!vectorStoreClient) {
        const openAIClient = OpenAIClient.getInstance({
            apiKey: process.env.OPENAI_API_KEY!,
            baseUrl: process.env.OPENAI_BASE_URL,
        });
        vectorStoreClient = new VectorStoreClient(
            {
                baseUrl: process.env.QDRANT_URL!,
                apiKey: process.env.QDRANT_API_KEY!,
                collectionName: process.env.QDRANT_COLLECTION!,
            },
            openAIClient.returnEmbeddingModel()
        );
    }

    if (!kgRetrievalService) {
        kgRetrievalService = new KGRetrievalService(new GraphQueryRepository());
    }

    return { embeddingService, vectorStoreClient, kgRetrievalService };
}

const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_MEMORY_SIMILARITY_THRESHOLD || '0.45');

export async function retrieveMemoriesHandler(args: { query: string; userId: string }) {
    const { query, userId } = args;
    const { embeddingService: emb, vectorStoreClient: vs, kgRetrievalService: kg } = getServices();

    const { embedding } = await emb.generateEmbedding(query);

    const rawDocs = await vs.searchByEmbedding(embedding, userId, 5);
    const filteredDocs = rawDocs.filter(d => d.score > SIMILARITY_THRESHOLD);

    const result = await kg.retrieve(userId, embedding, filteredDocs);

    return {
        highlights: result.enrichedMemories.map(m => ({
            text: m.text,
            topic: m.topicLabels.join(', '),
            similarity: m.finalScore,
        })),
        relatedTopics: result.relatedTopics.map(t => ({
            name: t.label,
            mentionCount: t.coOccurrenceCount,
        })),
        persons: result.personsContext.map(p => ({
            name: p.name,
            relationship: p.role ?? '',
        })),
    };
}
