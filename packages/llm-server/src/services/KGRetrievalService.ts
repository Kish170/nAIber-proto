import cosine from 'compute-cosine-similarity';
import { GraphQueryRepository } from '../repositories/GraphQueryRepository.js';
import { getConversationTopics } from '../personas/general/ConversationHandler.js';
import type {
    EnrichedMemory,
    KGRetrievalResult,
    KGHighlightContext,
    KGPersonResult,
    KGHighlightResult,
    KGRelatedTopic,
} from '../types/graph.js';
import type { MemoryDocument } from './MemoryRetriever.js';

export interface KGRetrievalConfig {
    alpha: number;
    pgTopicLimit: number;
    kgHighlightLimit: number;
    relatedTopicMinStrength: number;
    finalTopK: number;
}

const DEFAULT_CONFIG: KGRetrievalConfig = {
    alpha: 0.7,
    pgTopicLimit: 5,
    kgHighlightLimit: 10,
    relatedTopicMinStrength: 0.1,
    finalTopK: 5,
};

interface RankedTopic {
    id: string;
    topicName: string;
    similarity: number;
}

interface Stream1Result {
    topicsForHighlights: Map<string, { topicId: string; label: string; similarityScore: number }[]>;
    contextMap: Map<string, KGHighlightContext>;
}

interface Stream2Result {
    rankedTopics: RankedTopic[];
    topTopicIds: string[];
    kgDiscoveredHighlights: KGHighlightResult[];
    relatedTopics: KGRelatedTopic[];
    personsForTopics: KGPersonResult[];
}

export class KGRetrievalService {
    private graphQuery: GraphQueryRepository;
    private config: KGRetrievalConfig;

    constructor(graphQuery: GraphQueryRepository, config?: Partial<KGRetrievalConfig>) {
        this.graphQuery = graphQuery;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    async retrieve(
        userId: string,
        messageEmbedding: number[],
        qdrantDocuments: MemoryDocument[]
    ): Promise<KGRetrievalResult> {
        try {
            const qdrantPointIds = qdrantDocuments
                .map(d => d.metadata?.qdrantPointId)
                .filter((id): id is string => !!id);

            const [stream1, stream2] = await Promise.all([
                this.enrichQdrantResults(qdrantPointIds),
                this.discoverFromKG(userId, messageEmbedding),
            ]);

            const mergedMap = this.mergeAndDeduplicate(
                qdrantDocuments,
                stream1,
                stream2
            );

            const ranked = this.rerank(mergedMap);
            await this.expandContext(ranked);

            console.log('[KGRetrievalService] Retrieval complete:', {
                qdrantInput: qdrantDocuments.length,
                kgDiscovered: stream2.kgDiscoveredHighlights.length,
                merged: mergedMap.size,
                finalCount: ranked.length,
                personsCount: stream2.personsForTopics.length,
            });

            return {
                enrichedMemories: ranked,
                highlights: ranked.map(m => m.text),
                personsContext: stream2.personsForTopics,
            };
        } catch (error) {
            console.error('[KGRetrievalService] KG retrieval failed, falling back to empty:', error);
            return {
                enrichedMemories: [],
                highlights: [],
                personsContext: [],
            };
        }
    }

    private async enrichQdrantResults(qdrantPointIds: string[]): Promise<Stream1Result> {
        if (qdrantPointIds.length === 0) {
            return {
                topicsForHighlights: new Map(),
                contextMap: new Map(),
            };
        }

        const [topicsForHighlights, highlightContexts] = await Promise.all([
            this.graphQuery.getTopicsForHighlights(qdrantPointIds),
            this.graphQuery.getHighlightContext(qdrantPointIds),
        ]);

        const contextMap = new Map<string, KGHighlightContext>();
        for (const ctx of highlightContexts) {
            contextMap.set(ctx.qdrantPointId, ctx);
        }

        return { topicsForHighlights, contextMap };
    }

    private async discoverFromKG(userId: string, messageEmbedding: number[]): Promise<Stream2Result> {
        const pgTopics = await getConversationTopics(userId);
        const rankedTopics = this.rankTopicsByEmbedding(pgTopics, messageEmbedding);
        const topTopicIds = rankedTopics
            .slice(0, this.config.pgTopicLimit)
            .map(t => t.id);

        if (topTopicIds.length === 0) {
            return {
                rankedTopics,
                topTopicIds,
                kgDiscoveredHighlights: [],
                relatedTopics: [],
                personsForTopics: [],
            };
        }

        const [kgDiscoveredHighlights, relatedTopics, personsForTopics] = await Promise.all([
            this.graphQuery.getHighlightsByTopicIds(topTopicIds, this.config.kgHighlightLimit),
            this.graphQuery.getRelatedTopics(topTopicIds, this.config.relatedTopicMinStrength),
            this.graphQuery.getPersonsForTopics(topTopicIds),
        ]);

        return { rankedTopics, topTopicIds, kgDiscoveredHighlights, relatedTopics, personsForTopics };
    }

    private mergeAndDeduplicate(
        qdrantDocuments: MemoryDocument[],
        stream1: Stream1Result,
        stream2: Stream2Result
    ): Map<string, EnrichedMemory> {
        const mergedMap = new Map<string, EnrichedMemory>();

        for (const doc of qdrantDocuments) {
            const pid = doc.metadata?.qdrantPointId;
            if (!pid) continue;

            const ctx = stream1.contextMap.get(pid);
            const kgScore = this.computeKGScore(pid, stream1.topicsForHighlights, stream2.rankedTopics);

            mergedMap.set(pid, {
                qdrantPointId: pid,
                text: doc.pageContent,
                qdrantScore: doc.score,
                kgScore,
                finalScore: this.config.alpha * doc.score + (1 - this.config.alpha) * kgScore,
                topicLabels: ctx?.topics.map(t => t.label) ?? [],
                relatedTopics: stream2.relatedTopics
                    .filter(rt => ctx?.topics.some(t => stream2.topTopicIds.includes(t.topicId)))
                    .map(rt => rt.label),
                persons: ctx?.persons ?? [],
                conversationDate: ctx?.conversation?.startedAt,
                summaryText: ctx?.summary?.text,
                source: 'qdrant',
            });
        }

        for (const kgH of stream2.kgDiscoveredHighlights) {
            if (mergedMap.has(kgH.qdrantPointId)) {
                const existing = mergedMap.get(kgH.qdrantPointId)!;
                existing.source = 'both';
                existing.kgScore = Math.min(1.0, existing.kgScore + 0.15);
                existing.finalScore = this.config.alpha * existing.qdrantScore
                    + (1 - this.config.alpha) * existing.kgScore;
                continue;
            }

            const kgScore = this.computeKGScoreForDiscovery(kgH, stream2.rankedTopics);
            mergedMap.set(kgH.qdrantPointId, {
                qdrantPointId: kgH.qdrantPointId,
                text: kgH.text,
                qdrantScore: 0,
                kgScore,
                finalScore: (1 - this.config.alpha) * kgScore,
                topicLabels: kgH.topicLabels,
                relatedTopics: [],
                persons: [],
                conversationDate: kgH.createdAt,
                source: 'kg_discovery',
            });
        }

        return mergedMap;
    }

    private rerank(mergedMap: Map<string, EnrichedMemory>): EnrichedMemory[] {
        return Array.from(mergedMap.values())
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, this.config.finalTopK);
    }

    private async expandContext(ranked: EnrichedMemory[]): Promise<void> {
        const needsContext = ranked
            .filter(m => m.source === 'kg_discovery')
            .map(m => m.qdrantPointId);

        if (needsContext.length === 0) return;

        const extraCtx = await this.graphQuery.getHighlightContext(needsContext);
        for (const ctx of extraCtx) {
            const mem = ranked.find(m => m.qdrantPointId === ctx.qdrantPointId);
            if (mem) {
                mem.topicLabels = ctx.topics.map(t => t.label);
                mem.persons = ctx.persons;
                mem.conversationDate = ctx.conversation?.startedAt;
                mem.summaryText = ctx.summary?.text;
            }
        }
    }
    
    private rankTopicsByEmbedding(
        topics: { id: string; topicName: string; topicEmbedding: number[] }[],
        messageEmbedding: number[]
    ): RankedTopic[] {
        return topics
            .map(t => ({
                id: t.id,
                topicName: t.topicName,
                similarity: cosine(t.topicEmbedding, messageEmbedding) ?? 0,
            }))
            .sort((a, b) => b.similarity - a.similarity);
    }

    private computeKGScore(
        qdrantPointId: string,
        topicsForHighlights: Map<string, { topicId: string; label: string; similarityScore: number }[]>,
        rankedTopics: RankedTopic[]
    ): number {
        const topics = topicsForHighlights.get(qdrantPointId) || [];
        if (topics.length === 0) return 0;

        const rankedMap = new Map(rankedTopics.map(t => [t.id, t.similarity]));
        let score = 0;
        for (const t of topics) {
            const topicRelevance = rankedMap.get(t.topicId) ?? 0;
            score += topicRelevance * (t.similarityScore ?? 0.5);
        }
        return Math.min(1.0, score / topics.length);
    }

    private computeKGScoreForDiscovery(
        highlight: { importanceScore: number; topicIds: string[] },
        rankedTopics: RankedTopic[]
    ): number {
        const rankedMap = new Map(rankedTopics.map(t => [t.id, t.similarity]));
        let topicRelevance = 0;
        for (const tid of highlight.topicIds) {
            topicRelevance += rankedMap.get(tid) ?? 0;
        }
        topicRelevance = highlight.topicIds.length > 0
            ? topicRelevance / highlight.topicIds.length
            : 0;

        const importance = Math.min(1.0, highlight.importanceScore / 10);
        return 0.6 * topicRelevance + 0.4 * importance;
    }
}