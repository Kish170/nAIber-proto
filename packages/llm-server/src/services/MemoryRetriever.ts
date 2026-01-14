import { VectorStoreClient } from '@naiber/shared';

export interface MemoryDocument {
    pageContent: string;
    metadata: Record<string, any>;
    score: number;
}

export interface RetrievedMemories {
    highlights: string[];
    documents: MemoryDocument[];
}

interface MemoryRetrieverConfig {
    similarityThreshold: number;
    minResults: number;
}

export class MemoryRetriever {
    private vectorStore: VectorStoreClient;
    private config: MemoryRetrieverConfig;

    constructor(vectorStore: VectorStoreClient) {
        this.vectorStore = vectorStore;
        this.config = {
            similarityThreshold: parseFloat(process.env.RAG_MEMORY_SIMILARITY_THRESHOLD || '0.45'),
            minResults: parseInt(process.env.RAG_MEMORY_MIN_RESULTS || '1')
        };
    }

    async retrieveMemories(userId: string, topicEmbedding: number[], limit: number = 5): Promise<RetrievedMemories> {
        try {
            console.log('[MemoryRetriever] Retrieving memories for user:', userId);

            const searchResults = await this.vectorStore.searchByEmbedding(
                topicEmbedding,
                userId,
                limit
            );

            let relevantResults = searchResults.filter(
                r => r.score > this.config.similarityThreshold
            );

            if (relevantResults.length === 0 && searchResults.length > 0 && this.config.minResults > 0) {
                relevantResults = searchResults
                    .sort((a, b) => b.score - a.score)
                    .slice(0, this.config.minResults);
            }

            const highlights = relevantResults.map(r => r.pageContent);
            console.log('[MemoryRetriever] Retrieved', highlights.length, 'relevant memories');

            return {
                highlights,
                documents: relevantResults
            };
        } catch (error) {
            console.error('[MemoryRetriever] Failed to retrieve memories:', error);
            return {
                highlights: [],
                documents: []
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