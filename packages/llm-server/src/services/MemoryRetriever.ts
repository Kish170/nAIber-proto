import { QdrantClient, SearchPayload } from '@naiber/shared';

export interface RetrievedMemories {
    highlights: string[];
    summaries: SearchPayload[];
}

export class MemoryRetriever {
    private qdrantClient: QdrantClient;

    constructor(qdrantClient: QdrantClient) {
        this.qdrantClient = qdrantClient;
    }

    async retrieveMemories(userId: string, topicEmbedding: number[], limit: number = 5): Promise<RetrievedMemories> {
        try {
            console.log('[MemoryRetriever] Retrieving memories for user:', userId);

            const searchResults = await this.qdrantClient.searchCollection({
                userId,
                queryEmbedding: topicEmbedding,
                limit
            });
            const relevantResults = searchResults.filter(r => r.similarity > 0.7);
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