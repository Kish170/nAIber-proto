import neo4j, { Session } from 'neo4j-driver';
import { traceable } from 'langsmith/traceable';
import { Neo4jClient } from '@naiber/shared-clients';
import type {
    KGHighlightResult,
    KGRelatedTopic,
    KGPersonResult,
    KGHighlightContext,
} from './types.js';

export class GraphQueryRepository {

    private async runQuery<T>(fn: (session: Session) => Promise<T>): Promise<T> {
        const session = Neo4jClient.getInstance().session();
        try {
            return await fn(session);
        } finally {
            await session.close();
        }
    }

    getHighlightsByTopicIds = traceable(
        async (topicIds: string[], limit: number = 10): Promise<KGHighlightResult[]> => {
            return this.runQuery(async (session) => {
                const result = await session.run(
                    `MATCH (h:Highlight)-[m:MENTIONS]->(t:Topic)
                     WHERE t.topicId IN $topicIds
                     WITH h, collect(t.topicId) AS topicIds, collect(t.label) AS topicLabels
                     RETURN h.qdrantPointId   AS qdrantPointId,
                            h.text            AS text,
                            h.importanceScore AS importanceScore,
                            h.createdAt       AS createdAt,
                            topicIds,
                            topicLabels
                     ORDER BY h.importanceScore DESC
                     LIMIT $limit`,
                    { topicIds, limit: neo4j.int(limit) }
                );
                const highlights = result.records.map(r => ({
                    qdrantPointId: r.get('qdrantPointId'),
                    text: r.get('text'),
                    importanceScore: r.get('importanceScore'),
                    createdAt: r.get('createdAt'),
                    topicIds: r.get('topicIds'),
                    topicLabels: r.get('topicLabels'),
                }));

                const avgImportance = highlights.length > 0
                    ? highlights.reduce((sum, h) => sum + (h.importanceScore ?? 0), 0) / highlights.length
                    : 0;
                console.log(`[GraphQueryRepository] getHighlightsByTopicIds: topicIds=${topicIds.length} results=${highlights.length} avgImportanceScore=${avgImportance.toFixed(2)}`);

                return highlights;
            });
        },
        { name: 'neo4j_getHighlightsByTopicIds', run_type: 'chain' }
    );

    getTopicsForHighlights = traceable(
        async (
            qdrantPointIds: string[]
        ): Promise<Map<string, { topicId: string; label: string; similarityScore: number }[]>> => {
            return this.runQuery(async (session) => {
                const result = await session.run(
                    `MATCH (h:Highlight)-[m:MENTIONS]->(t:Topic)
                     WHERE h.qdrantPointId IN $qdrantPointIds
                     RETURN h.qdrantPointId   AS qdrantPointId,
                            t.topicId         AS topicId,
                            t.label           AS label,
                            m.similarityScore AS similarityScore`,
                    { qdrantPointIds }
                );
                const map = new Map<string, { topicId: string; label: string; similarityScore: number }[]>();
                for (const r of result.records) {
                    const pid = r.get('qdrantPointId');
                    if (!map.has(pid)) map.set(pid, []);
                    map.get(pid)!.push({
                        topicId: r.get('topicId'),
                        label: r.get('label'),
                        similarityScore: r.get('similarityScore') ?? 0,
                    });
                }

                console.log(`[GraphQueryRepository] getTopicsForHighlights: pointIds=${qdrantPointIds.length} pointsWithTopics=${map.size}`);

                return map;
            });
        },
        { name: 'neo4j_getTopicsForHighlights', run_type: 'chain' }
    );

    getRelatedTopics = traceable(
        async (topicIds: string[], minStrength: number = 0.1): Promise<KGRelatedTopic[]> => {
            return this.runQuery(async (session) => {
                const result = await session.run(
                    `MATCH (a:Topic)-[r:RELATED_TO]->(b:Topic)
                     WHERE a.topicId IN $topicIds
                       AND NOT b.topicId IN $topicIds
                       AND r.strength >= $minStrength
                     RETURN DISTINCT
                            b.topicId           AS topicId,
                            b.label             AS label,
                            r.strength          AS strength,
                            r.coOccurrenceCount AS coOccurrenceCount
                     ORDER BY r.strength DESC
                     LIMIT 10`,
                    { topicIds, minStrength }
                );
                const topics = result.records.map(r => ({
                    topicId: r.get('topicId'),
                    label: r.get('label'),
                    strength: r.get('strength'),
                    coOccurrenceCount: r.get('coOccurrenceCount'),
                }));

                console.log(`[GraphQueryRepository] getRelatedTopics: inputTopics=${topicIds.length} results=${topics.length} minStrength=${minStrength}`);

                return topics;
            });
        },
        { name: 'neo4j_getRelatedTopics', run_type: 'chain' }
    );

    getPersonsForTopics = traceable(
        async (topicIds: string[]): Promise<KGPersonResult[]> => {
            return this.runQuery(async (session) => {
                const result = await session.run(
                    `MATCH (p:Person)-[a:ASSOCIATED_WITH]->(t:Topic)
                     WHERE t.topicId IN $topicIds
                     WITH p, a, collect(t.topicId) AS associatedTopicIds
                     RETURN DISTINCT
                            p.id       AS personId,
                            p.name     AS name,
                            p.role     AS role,
                            a.count    AS mentionCount,
                            a.lastSeen AS lastSeen,
                            associatedTopicIds
                     ORDER BY a.count DESC
                     LIMIT 10`,
                    { topicIds }
                );
                const persons = result.records.map(r => ({
                    personId: r.get('personId'),
                    name: r.get('name'),
                    role: r.get('role'),
                    mentionCount: r.get('mentionCount'),
                    lastSeen: r.get('lastSeen'),
                    associatedTopicIds: r.get('associatedTopicIds'),
                }));

                console.log(`[GraphQueryRepository] getPersonsForTopics: topicIds=${topicIds.length} personsFound=${persons.length}`);

                return persons;
            });
        },
        { name: 'neo4j_getPersonsForTopics', run_type: 'chain' }
    );

    getInterestedInStrengths = traceable(
        async (userId: string, topicIds: string[]): Promise<Map<string, number>> => {
            return this.runQuery(async (session) => {
                if (topicIds.length === 0) return new Map();
                const result = await session.run(
                    `MATCH (u:User {userId: $userId})-[i:INTERESTED_IN]->(t:Topic)
                     WHERE t.topicId IN $topicIds
                     RETURN t.topicId AS topicId, i.strength AS strength`,
                    { userId, topicIds }
                );
                const map = new Map<string, number>();
                for (const r of result.records) {
                    map.set(r.get('topicId'), r.get('strength') ?? 0);
                }
                console.log(`[GraphQueryRepository] getInterestedInStrengths: userId=${userId} queried=${topicIds.length} matched=${map.size}`);
                return map;
            });
        },
        { name: 'neo4j_getInterestedInStrengths', run_type: 'chain' }
    );

    getHighlightContext = traceable(
        async (qdrantPointIds: string[]): Promise<KGHighlightContext[]> => {
            return this.runQuery(async (session) => {
                const result = await session.run(
                    `MATCH (h:Highlight)
                     WHERE h.qdrantPointId IN $qdrantPointIds
                     OPTIONAL MATCH (h)-[hm:MENTIONS]->(t:Topic)
                     OPTIONAL MATCH (s:Summary)-[:SUMMARIZES]->(h)
                     OPTIONAL MATCH (c:Conversation)-[:HAS_HIGHLIGHT]->(h)
                     OPTIONAL MATCH (p:Person)-[:ASSOCIATED_WITH]->(t)
                     WITH h, hm, t, s, c,
                          collect(DISTINCT {name: p.name, role: p.role}) AS persons
                     RETURN h.qdrantPointId AS qdrantPointId,
                            h.text          AS text,
                            collect(DISTINCT {topicId: t.topicId, label: t.label, similarityScore: hm.similarityScore}) AS topics,
                            s.id            AS summaryId,
                            s.text          AS summaryText,
                            c.conversationId AS conversationId,
                            c.date          AS startedAt,
                            c.callType      AS callType,
                            persons`,
                    { qdrantPointIds }
                );
                const contexts = result.records.map(r => ({
                    qdrantPointId: r.get('qdrantPointId'),
                    text: r.get('text'),
                    topics: (r.get('topics') || []).filter((t: { topicId: string | null }) => t.topicId !== null),
                    summary: r.get('summaryId')
                        ? { id: r.get('summaryId'), text: r.get('summaryText') }
                        : undefined,
                    conversation: r.get('conversationId')
                        ? {
                            conversationId: r.get('conversationId'),
                            startedAt: r.get('startedAt'),
                            callType: r.get('callType'),
                        }
                        : undefined,
                    persons: (r.get('persons') || []).filter((p: { name: string | null }) => p.name !== null),
                }));

                console.log(`[GraphQueryRepository] getHighlightContext: pointIds=${qdrantPointIds.length} contextsReturned=${contexts.length}`);

                return contexts;
            });
        },
        { name: 'neo4j_getHighlightContext', run_type: 'chain' }
    );
}