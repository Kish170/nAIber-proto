import { z } from 'zod';
import { traceable } from 'langsmith/traceable';
import { OpenAIClient } from '@naiber/shared-clients';
import { EmbeddingService } from '@naiber/shared-services';
import { VectorStoreClient } from '@naiber/shared-clients';
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

export const retrieveMemoriesHandler = traceable(
    async (args: { query: string; userId: string }) => {
        const { query, userId } = args;
        const { embeddingService: emb, vectorStoreClient: vs, kgRetrievalService: kg } = getServices();

        try {
            const { embedding } = await emb.generateEmbedding(query);

            const rawDocs = await vs.searchByEmbedding(embedding, userId, 5);
            const filteredDocs = rawDocs.filter(d => d.score > SIMILARITY_THRESHOLD);

            console.log(`[retrieveMemories] query="${query}" userId=${userId} rawDocs=${rawDocs.length} filteredDocs=${filteredDocs.length} threshold=${SIMILARITY_THRESHOLD}`);
            console.log(`[retrieveMemories] raw scores: [${rawDocs.map(d => d.score.toFixed(4)).join(', ')}]`);

            const result = await kg.retrieve(userId, embedding, filteredDocs);

            const sourceBreakdown = {
                fromQdrant: result.enrichedMemories.filter(m => m.source === 'qdrant').length,
                fromKG: result.enrichedMemories.filter(m => m.source === 'kg_discovery').length,
                fromBoth: result.enrichedMemories.filter(m => m.source === 'both').length,
            };

            console.log(`[retrieveMemories] results=${result.enrichedMemories.length} sources: qdrant=${sourceBreakdown.fromQdrant} kg=${sourceBreakdown.fromKG} both=${sourceBreakdown.fromBoth}`);

            return {
                highlights: result.enrichedMemories.map(m => ({
                    text: m.text,
                    topic: m.topicLabels.join(', '),
                    similarity: m.finalScore,
                    source: m.source,
                    via: m.expansionSource === 'related_topic' && m.viaRelatedTopicLabels?.length
                        ? `related topic: ${m.viaRelatedTopicLabels.join(', ')}`
                        : undefined,
                })),
                relatedTopics: result.relatedTopics.map(t => ({
                    name: t.label,
                    mentionCount: t.coOccurrenceCount,
                })),
                persons: result.personsContext.map(p => ({
                    name: p.name,
                    relationship: p.role ?? '',
                    via: p.expansionSource === 'related_topic' ? 'related topic expansion' : undefined,
                })),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`retrieveMemories failed for query "${query}": ${message}`);
        }
    },
    {
        name: 'retrieveMemories',
        run_type: 'retriever',
        metadata: { similarityThreshold: SIMILARITY_THRESHOLD },
    }
);
