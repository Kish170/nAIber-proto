export interface MemoryDocument {
    pageContent: string;
    metadata: Record<string, unknown>;
    score: number;
}

export interface KGHighlightResult {
    qdrantPointId: string;
    text: string;
    importanceScore: number;
    createdAt: string;
    topicIds: string[];
    topicLabels: string[];
}

export interface KGRelatedTopic {
    topicId: string;
    label: string;
    strength: number;
    coOccurrenceCount: number;
}

export interface KGPersonResult {
    personId: string;
    name: string;
    role?: string;
    mentionCount: number;
    lastSeen: string;
    associatedTopicIds: string[];
}

export interface KGHighlightContext {
    qdrantPointId: string;
    text: string;
    topics: { topicId: string; label: string; similarityScore: number }[];
    summary?: { id: string; text: string };
    conversation?: { conversationId: string; startedAt: string; callType: string };
    persons: { name: string; role?: string }[];
}

export interface EnrichedMemory {
    qdrantPointId: string;
    text: string;
    qdrantScore: number;
    kgScore: number;
    finalScore: number;
    topicLabels: string[];
    relatedTopics: string[];
    persons: { name: string; role?: string }[];
    conversationDate?: string;
    summaryText?: string;
    source: 'qdrant' | 'kg_discovery' | 'both';
}

export interface KGRetrievalResult {
    enrichedMemories: EnrichedMemory[];
    highlights: string[];
    personsContext: KGPersonResult[];
}

// Extended result that includes relatedTopics with coOccurrenceCount
// (not present in the llm-server KGRetrievalResult — added here for the retrieveMemories tool output)
export interface KGRetrievalResultExtended extends KGRetrievalResult {
    relatedTopics: KGRelatedTopic[];
}
