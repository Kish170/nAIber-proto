import neo4j, { Session } from 'neo4j-driver';
import { Neo4jClient } from '../clients/Neo4jClient.js';
import type {
    KGHighlightResult,
    KGRelatedTopic,
    KGPersonResult,
    KGHighlightContext,
} from '../types/graph.js';

export class GraphQueryRepository {

    private async runQuery<T>(fn: (session: Session) => Promise<T>): Promise<T> {
        const session = Neo4jClient.getInstance().session();
        try {
            return await fn(session);
        } finally {
            await session.close();
        }
    }

    async getHighlightsByTopicIds(topicIds: string[], limit: number = 10): Promise<KGHighlightResult[]> {
        try {
            return await this.runQuery(async (session) => {
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
                return result.records.map(r => ({
                    qdrantPointId: r.get('qdrantPointId'),
                    text: r.get('text'),
                    importanceScore: r.get('importanceScore'),
                    createdAt: r.get('createdAt'),
                    topicIds: r.get('topicIds'),
                    topicLabels: r.get('topicLabels'),
                }));
            });
        } catch (error) {
            console.error('[GraphQueryRepository] Error getting highlights by topic IDs:', error);
            throw error;
        }
    }

    async getTopicsForHighlights(
        qdrantPointIds: string[]
    ): Promise<Map<string, { topicId: string; label: string; similarityScore: number }[]>> {
        try {
            return await this.runQuery(async (session) => {
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
                return map;
            });
        } catch (error) {
            console.error('[GraphQueryRepository] Error getting topics for highlights:', error);
            throw error;
        }
    }

    async getRelatedTopics(topicIds: string[], minStrength: number = 0.1): Promise<KGRelatedTopic[]> {
        try {
            return await this.runQuery(async (session) => {
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
                return result.records.map(r => ({
                    topicId: r.get('topicId'),
                    label: r.get('label'),
                    strength: r.get('strength'),
                    coOccurrenceCount: r.get('coOccurrenceCount'),
                }));
            });
        } catch (error) {
            console.error('[GraphQueryRepository] Error getting related topics:', error);
            throw error;
        }
    }

    async getPersonsForTopics(topicIds: string[]): Promise<KGPersonResult[]> {
        try {
            return await this.runQuery(async (session) => {
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
                return result.records.map(r => ({
                    personId: r.get('personId'),
                    name: r.get('name'),
                    role: r.get('role'),
                    mentionCount: r.get('mentionCount'),
                    lastSeen: r.get('lastSeen'),
                    associatedTopicIds: r.get('associatedTopicIds'),
                }));
            });
        } catch (error) {
            console.error('[GraphQueryRepository] Error getting persons for topics:', error);
            throw error;
        }
    }

    async getTopicsForPersons(personIds: string[]): Promise<Map<string, { topicId: string; label: string; count: number }[]>> {
        try {
            return await this.runQuery(async (session) => {
                const result = await session.run(
                    `MATCH (p:Person)-[a:ASSOCIATED_WITH]->(t:Topic)
                     WHERE p.id IN $personIds
                     RETURN p.id    AS personId,
                            t.topicId AS topicId,
                            t.label   AS label,
                            a.count   AS count`,
                    { personIds }
                );
                const map = new Map<string, { topicId: string; label: string; count: number }[]>();
                for (const r of result.records) {
                    const pid = r.get('personId');
                    if (!map.has(pid)) map.set(pid, []);
                    map.get(pid)!.push({
                        topicId: r.get('topicId'),
                        label: r.get('label'),
                        count: r.get('count'),
                    });
                }
                return map;
            });
        } catch (error) {
            console.error('[GraphQueryRepository] Error getting topics for persons:', error);
            throw error;
        }
    }

    async getHighlightContext(qdrantPointIds: string[]): Promise<KGHighlightContext[]> {
        try {
            return await this.runQuery(async (session) => {
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
                return result.records.map(r => ({
                    qdrantPointId: r.get('qdrantPointId'),
                    text: r.get('text'),
                    topics: (r.get('topics') || []).filter((t: any) => t.topicId !== null),
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
                    persons: (r.get('persons') || []).filter((p: any) => p.name !== null),
                }));
            });
        } catch (error) {
            console.error('[GraphQueryRepository] Error getting highlight context:', error);
            throw error;
        }
    }
}
