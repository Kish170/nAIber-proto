import cosine from 'compute-cosine-similarity';
import { traceable } from 'langsmith/traceable';
import { ConversationRepository } from '@naiber/shared-data';
import { GraphQueryRepository } from './GraphQueryRepository.js';
import type {
    MemoryDocument,
    KGHighlightResult,
    KGRelatedTopic,
    KGPersonResult,
    KGHighlightContext,
    EnrichedMemory,
    KGRetrievalResultExtended,
} from './types.js';

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

    retrieve = traceable(
        async (
            userId: string,
            messageEmbedding: number[],
            qdrantDocuments: MemoryDocument[]
        ): Promise<KGRetrievalResultExtended> => {
            try {
                const qdrantPointIds = qdrantDocuments
                    .map(d => d.metadata?.qdrantPointId)
                    .filter((id): id is string => typeof id === 'string' && !!id);

                console.log(`[KGRetrievalService] Starting retrieval: qdrantDocs=${qdrantDocuments.length} qdrantPointIds=${qdrantPointIds.length}`);

                const [stream1, stream2] = await Promise.all([
                    this.enrichQdrantResults(qdrantPointIds),
                    this.discoverFromKG(userId, messageEmbedding),
                ]);

                const mergedMap = this.mergeAndDeduplicate(qdrantDocuments, stream1, stream2);
                const ranked = this.rerank(mergedMap);
                await this.expandContext(ranked);

                console.log(`[KGRetrievalService] Retrieval complete: enrichedMemories=${ranked.length} persons=${stream2.personsForTopics.length} relatedTopics=${stream2.relatedTopics.length}`);

                return {
                    enrichedMemories: ranked,
                    highlights: ranked.map(m => m.text),
                    personsContext: stream2.personsForTopics,
                    relatedTopics: stream2.relatedTopics,
                };
            } catch (error) {
                console.error('[KGRetrievalService] KG retrieval failed, falling back to empty:', error);
                return { enrichedMemories: [], highlights: [], personsContext: [], relatedTopics: [] };
            }
        },
        { name: 'kg_retrieval', run_type: 'chain' }
    );

    private enrichQdrantResults = traceable(
        async (qdrantPointIds: string[]): Promise<Stream1Result> => {
            if (qdrantPointIds.length === 0) {
                console.log('[KGRetrievalService] enrichQdrantResults: no point IDs to enrich');
                return { topicsForHighlights: new Map(), contextMap: new Map() };
            }

            const [topicsForHighlights, highlightContexts] = await Promise.all([
                this.graphQuery.getTopicsForHighlights(qdrantPointIds),
                this.graphQuery.getHighlightContext(qdrantPointIds),
            ]);

            const contextMap = new Map<string, KGHighlightContext>();
            for (const ctx of highlightContexts) {
                contextMap.set(ctx.qdrantPointId, ctx);
            }

            const pointsWithTopics = qdrantPointIds.filter(id => (topicsForHighlights.get(id)?.length ?? 0) > 0);
            const pointsWithoutTopics = qdrantPointIds.filter(id => !pointsWithTopics.includes(id));

            console.log(`[KGRetrievalService] enrichQdrantResults: pointIds=${qdrantPointIds.length} withTopics=${pointsWithTopics.length} withoutTopics(miss)=${pointsWithoutTopics.length} contextsFound=${contextMap.size}`);

            return { topicsForHighlights, contextMap };
        },
        { name: 'kg_enrich_qdrant', run_type: 'chain' }
    );

    private discoverFromKG = traceable(
        async (userId: string, messageEmbedding: number[]): Promise<Stream2Result> => {
            const pgTopics = await ConversationRepository.findTopicsByElderlyProfileId(userId);
            const rawRankedTopics = this.rankTopicsByEmbedding(
                pgTopics.map(t => ({ id: t.id, topicName: t.topicName, topicEmbedding: (t.topicEmbedding ?? []) as number[] })),
                messageEmbedding
            );

            const interestedInMap = await this.graphQuery.getInterestedInStrengths(
                userId,
                rawRankedTopics.map(t => t.id)
            );
            const rankedTopics = rawRankedTopics
                .map(t => ({
                    ...t,
                    similarity: Math.min(1.0, t.similarity * (1 + (interestedInMap.get(t.id) ?? 0)))
                }))
                .sort((a, b) => b.similarity - a.similarity);

            const topTopicIds = rankedTopics.slice(0, this.config.pgTopicLimit).map(t => t.id);
            const topTopics = rankedTopics.slice(0, this.config.pgTopicLimit);
            console.log(`[KGRetrievalService] discoverFromKG: pgTopics=${pgTopics.length} interestedIn=${interestedInMap.size} topTopics=[${topTopics.map(t => `${t.topicName}(${t.similarity.toFixed(3)})`).join(', ')}]`);

            if (topTopicIds.length === 0) {
                console.log('[KGRetrievalService] discoverFromKG: no topics found — KG discovery empty');
                return { rankedTopics, topTopicIds, kgDiscoveredHighlights: [], relatedTopics: [], personsForTopics: [] };
            }

            const [kgDiscoveredHighlights, relatedTopics, personsForTopics] = await Promise.all([
                this.graphQuery.getHighlightsByTopicIds(topTopicIds, this.config.kgHighlightLimit),
                this.graphQuery.getRelatedTopics(topTopicIds, this.config.relatedTopicMinStrength),
                this.graphQuery.getPersonsForTopics(topTopicIds),
            ]);

            for (const h of kgDiscoveredHighlights) h.expansionSource = 'direct';
            for (const p of personsForTopics) p.expansionSource = 'direct';

            if (relatedTopics.length > 0) {
                const relatedTopicIds = relatedTopics.map(rt => rt.topicId);
                const relatedTopicLabelMap = new Map(relatedTopics.map(rt => [rt.topicId, rt.label]));

                const [relatedHighlights, relatedPersons] = await Promise.all([
                    this.graphQuery.getHighlightsByTopicIds(
                        relatedTopicIds,
                        Math.ceil(this.config.kgHighlightLimit / 2)
                    ),
                    this.graphQuery.getPersonsForTopics(relatedTopicIds),
                ]);

                const directHighlightIds = new Set(kgDiscoveredHighlights.map(h => h.qdrantPointId));
                let highlightsAdded = 0;
                for (const h of relatedHighlights) {
                    if (!directHighlightIds.has(h.qdrantPointId)) {
                        h.expansionSource = 'related_topic';
                        h.viaRelatedTopicLabels = h.topicIds
                            .map(tid => relatedTopicLabelMap.get(tid))
                            .filter((l): l is string => !!l);
                        kgDiscoveredHighlights.push(h);
                        highlightsAdded++;
                    }
                }

                const directPersonIds = new Set(personsForTopics.map(p => p.personId));
                let personsAdded = 0;
                for (const p of relatedPersons) {
                    if (!directPersonIds.has(p.personId)) {
                        p.expansionSource = 'related_topic';
                        personsForTopics.push(p);
                        personsAdded++;
                    }
                }

                console.log(`[KGRetrievalService] discoverFromKG: relatedTopicExpansion relatedTopics=${relatedTopics.length} highlightsAdded=${highlightsAdded} personsAdded=${personsAdded}`);
            }

            console.log(`[KGRetrievalService] discoverFromKG: kgHighlights=${kgDiscoveredHighlights.length} relatedTopics=${relatedTopics.length} persons=${personsForTopics.length}`);

            return { rankedTopics, topTopicIds, kgDiscoveredHighlights, relatedTopics, personsForTopics };
        },
        { name: 'kg_discover', run_type: 'chain' }
    );

    private mergeAndDeduplicate(
        qdrantDocuments: MemoryDocument[],
        stream1: Stream1Result,
        stream2: Stream2Result
    ): Map<string, EnrichedMemory> {
        const effectiveAlpha = qdrantDocuments.length > 0 ? this.config.alpha : 0.0;
        if (effectiveAlpha !== this.config.alpha) {
            console.log(`[KGRetrievalService] mergeAndDeduplicate: no Qdrant results — effectiveAlpha=0 (configured alpha=${this.config.alpha})`);
        }

        const mergedMap = new Map<string, EnrichedMemory>();

        for (const doc of qdrantDocuments) {
            const pid = doc.metadata?.qdrantPointId as string | undefined;
            if (!pid) continue;

            const ctx = stream1.contextMap.get(pid);
            const kgScore = this.computeKGScore(pid, stream1.topicsForHighlights, stream2.rankedTopics);

            mergedMap.set(pid, {
                qdrantPointId: pid,
                text: doc.pageContent,
                qdrantScore: doc.score,
                kgScore,
                finalScore: effectiveAlpha * doc.score + (1 - effectiveAlpha) * kgScore,
                topicLabels: ctx?.topics.map(t => t.label) ?? [],
                relatedTopics: stream2.relatedTopics
                    .filter(_rt => ctx?.topics.some(t => stream2.topTopicIds.includes(t.topicId)))
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
                existing.finalScore =
                    effectiveAlpha * existing.qdrantScore +
                    (1 - effectiveAlpha) * existing.kgScore;
                if (!existing.expansionSource || kgH.expansionSource === 'direct') {
                    existing.expansionSource = kgH.expansionSource;
                    existing.viaRelatedTopicLabels = kgH.viaRelatedTopicLabels;
                }
                continue;
            }

            const kgScore = this.computeKGScoreForDiscovery(kgH, stream2.rankedTopics);
            mergedMap.set(kgH.qdrantPointId, {
                qdrantPointId: kgH.qdrantPointId,
                text: kgH.text,
                qdrantScore: 0,
                kgScore,
                finalScore: (1 - effectiveAlpha) * kgScore,
                topicLabels: kgH.topicLabels,
                relatedTopics: [],
                persons: [],
                conversationDate: kgH.createdAt,
                source: 'kg_discovery',
                expansionSource: kgH.expansionSource,
                viaRelatedTopicLabels: kgH.viaRelatedTopicLabels,
            });
        }

        const sourceBreakdown = {
            fromQdrant: Array.from(mergedMap.values()).filter(m => m.source === 'qdrant').length,
            fromKG: Array.from(mergedMap.values()).filter(m => m.source === 'kg_discovery').length,
            fromBoth: Array.from(mergedMap.values()).filter(m => m.source === 'both').length,
        };
        console.log(`[KGRetrievalService] mergeAndDeduplicate: total=${mergedMap.size} qdrant=${sourceBreakdown.fromQdrant} kg=${sourceBreakdown.fromKG} both=${sourceBreakdown.fromBoth}`);

        for (const mem of mergedMap.values()) {
            const expansion = mem.expansionSource === 'related_topic'
                ? ` via=[${(mem.viaRelatedTopicLabels ?? []).join(',')}]`
                : '';
            console.log(`[KGRetrievalService]   ${mem.qdrantPointId.slice(0, 8)}... qdrantScore=${mem.qdrantScore.toFixed(4)} kgScore=${mem.kgScore.toFixed(4)} finalScore=${mem.finalScore.toFixed(4)} source=${mem.source}${expansion}`);
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
        topicRelevance = highlight.topicIds.length > 0 ? topicRelevance / highlight.topicIds.length : 0;

        const importance = Math.min(1.0, highlight.importanceScore / 10);
        return 0.6 * topicRelevance + 0.4 * importance;
    }
}