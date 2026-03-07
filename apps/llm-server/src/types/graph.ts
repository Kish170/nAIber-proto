export interface UserNode {
    userId: string;
    name: string;
}

export interface TopicNode {
    topicId: string;
    label: string;
    variations: string[];
    createdAt: string;
    lastUpdated: string;
}

export interface HighlightNode {
    id: string;
    qdrantPointId: string;
    text: string;
    importanceScore: number;
    createdAt: string;
}

export interface SummaryNode {
    id: string;
    text: string;
    createdAt: string;
}

export interface ConversationNode {
    conversationId: string;
    date: string;
    durationMinutes: number | null;
    callType: 'general' | 'health_check';
    outcome: string;
}

export interface PersonNode {
    id: string;
    name: string;
    role?: string;
}

export interface LinkUserToConversationParams {
    userId: string;
    conversationId: string;
}

export interface LinkConversationToSummaryParams {
    conversationId: string;
    summaryId: string;
    createdAt: string;
}

export interface LinkConversationToHighlightParams {
    conversationId: string;
    highlightQdrantPointId: string;
    createdAt: string;
}

export interface LinkSummaryToHighlightParams {
    summaryId: string;
    highlightQdrantPointId: string;
}

export interface UserMentionsTopicParams {
    userId: string;
    topicId: string;
    lastSeen: string;
    firstSeen: string;
}

export interface UserInterestedInTopicParams {
    userId: string;
    topicId: string;
    strength: number;
    count: number;
    derivedAt: string;
}

export interface TopicRelatedToTopicParams {
    fromTopicId: string;
    toTopicId: string;
    strength: number;
    coOccurrenceCount: number;
}

export interface HighlightMentionsTopicParams {
    highlightId: string;
    topicId: string;
    similarityScore: number;
}

export interface SummaryMentionsTopicParams {
    summaryId: string;
    topicId: string;
    similarityScore: number;
}

export interface UserMentionedPersonParams {
    userId: string;
    personId: string;
    context: string;
    lastSeen: string;
}

export interface PersonAssociatedWithTopicParams {
    personId: string;
    topicId: string;
    lastSeen: string;
}

// ── Read-side return types (KG retrieval) ────────────────────────

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