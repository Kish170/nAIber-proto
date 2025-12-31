import { QdrantClient, SearchPayload } from '@naiber/shared';

export interface RetrievedMemories {
    highlights: string[];
    summaries: SearchPayload[];
}

interface MemoryRetrieverConfig {
    similarityThreshold: number;
    minResults: number;
}

export class MemoryRetriever {
    private qdrantClient: QdrantClient;
    private config: MemoryRetrieverConfig;

    constructor(qdrantClient: QdrantClient) {
        this.qdrantClient = qdrantClient;
        this.config = {
            similarityThreshold: parseFloat(process.env.RAG_MEMORY_SIMILARITY_THRESHOLD || '0.45'),
            minResults: parseInt(process.env.RAG_MEMORY_MIN_RESULTS || '1')
        };
    }

    async retrieveMemories(userId: string, topicEmbedding: number[], limit: number = 5): Promise<RetrievedMemories> {
        try {
            console.log('[MemoryRetriever] Retrieving memories for user:', userId);

            const searchResults = await this.qdrantClient.searchCollection({
                userId,
                queryEmbedding: topicEmbedding,
                limit
            });

            let relevantResults = searchResults.filter(
                r => r.similarity > this.config.similarityThreshold
            );

            // Fallback: always return top N if no results above threshold
            if (relevantResults.length === 0 && searchResults.length > 0 && this.config.minResults > 0) {
                relevantResults = searchResults
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, this.config.minResults);
            }

            const highlights = relevantResults.map(r => r.highlight);
            console.log('[MemoryRetriever] Retrieved', highlights.length, 'relevant memories');

            return {
                highlights,
                summaries: relevantResults
            };
        } catch (error) {
            console.error('[MemoryRetriever] Failed to retrieve memories:', error);
            return {
                highlights: [],
                summaries: []
            };
        }
    }

    formatMemoriesForContext(memories: RetrievedMemories): string {
        if (memories.highlights.length === 0) {
            return '';
        }

        const formattedHighlights = memories.highlights
            .map((h, i) => `${i + 1}. ${h}`)
            .join('\n');

        return `\n\n# RELEVANT MEMORIES FROM PAST CONVERSATIONS
                ${formattedHighlights}
                Use these memories to provide continuity and show you remember previous discussions. Reference them naturally when relevant to the current conversation.
                `;
    }
}