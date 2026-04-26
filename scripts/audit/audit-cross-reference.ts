/**
 * Cross-reference audit between Qdrant, Neo4j, and Postgres for a given userId.
 * Checks consistency of data across all three stores.
 *
 * Usage: npx tsx scripts/audit/audit-cross-reference.ts [userId]
 *
 * Prerequisites: QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION, NEO4J_*, DATABASE_URL in .env
 */
import 'dotenv/config';
import neo4j, { Driver } from 'neo4j-driver';
import { PrismaClient } from '../../generated/prisma/index.js';

type QdrantEntryType = 'highlight' | 'topic' | 'person' | 'event' | 'unknown';

const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;
const COLLECTION = process.env.QDRANT_COLLECTION!;

type QdrantPayload = Record<string, any> & {
    metadata?: Record<string, any>;
    qdrantPointId?: string;
    conversationId?: string;
};

interface QdrantPoint {
    id: string;
    payload: QdrantPayload;
}

function getQdrantPointId(point: QdrantPoint): string {
    return point.payload.metadata?.qdrantPointId || point.payload.qdrantPointId || point.id;
}

async function findBestUserId(): Promise<string> {
    const prisma = new PrismaClient();
    try {
        const profiles = await prisma.elderlyProfile.findMany({
            include: { _count: { select: { conversationSummaries: true } } },
        });
        const best = profiles.sort((a, b) => b._count.conversationSummaries - a._count.conversationSummaries)[0];
        if (!best) throw new Error('No profiles found');
        console.log(`Auto-selected user: "${best.name}" (${best.id})\n`);
        return best.id;
    } finally {
        await prisma.$disconnect();
    }
}

async function qdrantScroll(filter: Record<string, any>): Promise<QdrantPoint[]> {
    const allPoints: QdrantPoint[] = [];
    let offset: string | null = null;

    while (true) {
        const body: Record<string, any> = { filter, limit: 100, with_payload: true };
        if (offset) body.offset = offset;

        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
        const data = await res.json();
        allPoints.push(...(data.result?.points ?? []));
        if (!data.result?.next_page_offset) break;
        offset = data.result.next_page_offset;
    }
    return allPoints;
}

async function runNeo4j<T>(driver: Driver, query: string, params: Record<string, any> = {}): Promise<T[]> {
    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
        const result = await session.run(query, params);
        return result.records.map(r => r.toObject() as T);
    } finally {
        await session.close();
    }
}

async function main() {
    const userId = process.argv[2] || await findBestUserId();
    const prisma = new PrismaClient();
    const driver = neo4j.driver(
        process.env.NEO4J_URI || 'bolt://localhost:7687',
        neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
        { disableLosslessIntegers: true }
    );

    try {
        console.log('=== CROSS-REFERENCE AUDIT ===');
        console.log(`User ID: ${userId}\n`);

        // --- Fetch data from all three stores ---

        // Postgres: summaries, topics, and call events
        const pgSummaries = await prisma.conversationSummary.findMany({
            where: { elderlyProfileId: userId },
            include: { conversationTopicRefs: { include: { conversationTopic: true } } },
        });
        const pgTopics = await prisma.conversationTopic.findMany({
            where: { elderlyProfileId: userId },
        });
        let pgCallEvents: any[] = [];
        try {
            pgCallEvents = await (prisma as any).callEvent.findMany({
                where: { elderlyProfileId: userId },
                orderBy: { detectedAt: 'desc' },
            });
        } catch {
            // call_events table does not exist yet — migration pending deployment
        }

        // Qdrant: all vectors for user
        const qdrantPoints = await qdrantScroll({
            must: [{ key: 'metadata.userId', match: { value: userId } }],
        });

        // Partition Qdrant points by type
        const getType = (p: QdrantPoint): QdrantEntryType => {
            const t = p.payload.metadata?.type ?? p.payload.type;
            if (t === 'highlight' || t === 'topic' || t === 'person' || t === 'event') return t;
            return t ? 'unknown' : 'highlight'; // legacy entries without type field default to highlight
        };
        const qdrantByType = new Map<QdrantEntryType, QdrantPoint[]>();
        for (const p of qdrantPoints) {
            const type = getType(p);
            if (!qdrantByType.has(type)) qdrantByType.set(type, []);
            qdrantByType.get(type)!.push(p);
        }

        const qdrantHighlights = [...(qdrantByType.get('highlight') ?? [])];
        const qdrantTopicEntries = qdrantByType.get('topic') ?? [];
        const qdrantPersonEntries = qdrantByType.get('person') ?? [];
        const qdrantEventEntries = qdrantByType.get('event') ?? [];

        // Neo4j: highlights, topics, persons, conversations
        const neo4jHighlights = await runNeo4j<{ qdrantPointId: string | null; text: string | null; importanceScore: number | null }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c)-[:HAS_HIGHLIGHT]->(h:Highlight)
             RETURN h.qdrantPointId AS qdrantPointId, h.text AS text, h.importanceScore AS importanceScore`, { userId });

        const neo4jTopics = await runNeo4j<{ topicId: string | null; label: string | null }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONS]->(t:Topic)
             RETURN t.topicId AS topicId, t.label AS label`, { userId });

        const neo4jPersons = await runNeo4j<{ personId: string | null; name: string | null }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONED]->(p:Person)
             RETURN p.id AS personId, p.name AS name`, { userId });

        const neo4jConversations = await runNeo4j<{ conversationId: string | null }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c:Conversation)
             RETURN c.conversationId AS conversationId`, { userId });

        // --- Overview ---
        console.log('--- Store Counts ---');
        console.log(`Postgres summaries: ${pgSummaries.length}`);
        console.log(`Postgres topics: ${pgTopics.length}`);
        console.log(`Postgres call events: ${pgCallEvents.length}`);
        console.log(`Qdrant total vectors: ${qdrantPoints.length}`);
        console.log(`  highlights: ${qdrantHighlights.length}`);
        console.log(`  topics: ${qdrantTopicEntries.length}`);
        console.log(`  persons: ${qdrantPersonEntries.length}`);
        console.log(`  events: ${qdrantEventEntries.length}`);
        console.log(`Neo4j highlights: ${neo4jHighlights.length}`);
        console.log(`Neo4j topics: ${neo4jTopics.length}`);
        console.log(`Neo4j persons: ${neo4jPersons.length}`);
        console.log(`Neo4j conversations: ${neo4jConversations.length}`);

        // --- Qdrant highlight ↔ Neo4j Highlight consistency ---
        console.log('\n--- Qdrant highlights ↔ Neo4j Highlight Consistency ---');
        const qdrantHighlightIds = new Set(qdrantHighlights.map(getQdrantPointId));
        const neo4jHighlightIds = new Set(neo4jHighlights.map(h => h.qdrantPointId).filter((id): id is string => Boolean(id)));

        const highlightsInBoth = [...qdrantHighlightIds].filter(id => neo4jHighlightIds.has(id));
        const highlightsInQdrantOnly = [...qdrantHighlightIds].filter(id => !neo4jHighlightIds.has(id));
        const highlightsInNeo4jOnly = [...neo4jHighlightIds].filter(id => !qdrantHighlightIds.has(id));

        console.log(`In both: ${highlightsInBoth.length}`);
        console.log(`In Qdrant only (no Neo4j node): ${highlightsInQdrantOnly.length} ${highlightsInQdrantOnly.length > 0 ? '⚠' : ''}`);
        console.log(`In Neo4j only (no Qdrant vector): ${highlightsInNeo4jOnly.length} ${highlightsInNeo4jOnly.length > 0 ? '⚠' : ''}`);
        if (highlightsInQdrantOnly.length > 0) {
            console.log(`  Qdrant-only samples: ${highlightsInQdrantOnly.slice(0, 5).map(id => id.slice(0, 8) + '...').join(', ')}`);
        }
        if (highlightsInNeo4jOnly.length > 0) {
            console.log(`  Neo4j-only samples: ${highlightsInNeo4jOnly.slice(0, 5).map(id => id.slice(0, 8) + '...').join(', ')}`);
        }
        const highlightConsistency = qdrantHighlightIds.size > 0
            ? (highlightsInBoth.length / qdrantHighlightIds.size * 100).toFixed(0)
            : 'N/A';
        console.log(`Consistency: ${highlightConsistency}%`);

        // --- Qdrant topic entries ↔ Postgres topics ---
        console.log('\n--- Qdrant topic entries ↔ Postgres Topic Consistency ---');
        const qdrantTopicIds = new Set(
            qdrantTopicEntries.map(p => p.payload.metadata?.topicId ?? p.payload.topicId).filter(Boolean)
        );
        const pgTopicIds = new Set(pgTopics.map(t => t.id));

        const topicsInBothStores = [...qdrantTopicIds].filter(id => pgTopicIds.has(id));
        const topicsInQdrantOnly = [...qdrantTopicIds].filter(id => !pgTopicIds.has(id));
        const pgTopicsWithoutQdrant = [...pgTopicIds].filter(id => !qdrantTopicIds.has(id));

        console.log(`Qdrant topic entries: ${qdrantTopicEntries.length}`);
        console.log(`Postgres topics: ${pgTopics.length}`);
        console.log(`topicId match (in both): ${topicsInBothStores.length}`);
        console.log(`In Qdrant but not Postgres (stale?): ${topicsInQdrantOnly.length} ${topicsInQdrantOnly.length > 0 ? '⚠' : ''}`);
        console.log(`In Postgres but no Qdrant vector: ${pgTopicsWithoutQdrant.length}`);
        if (pgTopicsWithoutQdrant.length > 0) {
            const pgOnlyLabels = pgTopics.filter(t => pgTopicsWithoutQdrant.includes(t.id)).map(t => t.topicName);
            const legacy = pgOnlyLabels.length > 8 ? ` (${pgOnlyLabels.length - 8} more...)` : '';
            console.log(`  Without Qdrant vector: ${pgOnlyLabels.slice(0, 8).join(', ')}${legacy}`);
            console.log(`  Note: topics without Qdrant entries are from pre-pipeline seed data or earlier calls`);
        }
        const topicConsistency = pgTopicIds.size > 0
            ? (topicsInBothStores.length / pgTopicIds.size * 100).toFixed(0)
            : 'N/A';
        console.log(`Coverage (pg topics with Qdrant vector): ${topicConsistency}%`);

        // --- Qdrant person entries ↔ Neo4j Person nodes ---
        console.log('\n--- Qdrant person entries ↔ Neo4j Person Consistency ---');
        const qdrantPersonIds = new Set(
            qdrantPersonEntries.map(p => p.payload.metadata?.personId ?? p.payload.personId).filter(Boolean)
        );
        const neo4jPersonIds = new Set(neo4jPersons.map(p => p.personId).filter((id): id is string => Boolean(id)));

        const personsInBoth = [...qdrantPersonIds].filter(id => neo4jPersonIds.has(id));
        const personsInQdrantOnly = [...qdrantPersonIds].filter(id => !neo4jPersonIds.has(id));
        const neo4jPersonsWithoutQdrant = [...neo4jPersonIds].filter(id => !qdrantPersonIds.has(id));

        console.log(`Qdrant person entries: ${qdrantPersonEntries.length}`);
        console.log(`Neo4j persons: ${neo4jPersons.length}`);
        console.log(`personId match (in both): ${personsInBoth.length}`);
        console.log(`In Qdrant but not Neo4j (stale?): ${personsInQdrantOnly.length} ${personsInQdrantOnly.length > 0 ? '⚠' : ''}`);
        console.log(`In Neo4j but no Qdrant vector: ${neo4jPersonsWithoutQdrant.length}`);
        if (neo4jPersonsWithoutQdrant.length > 0) {
            const neo4jOnlyNames = neo4jPersons
                .filter(p => p.personId && neo4jPersonsWithoutQdrant.includes(p.personId))
                .map(p => p.name ?? '(unnamed)');
            console.log(`  Without Qdrant vector: ${neo4jOnlyNames.slice(0, 8).join(', ')}`);
            console.log(`  Note: persons without Qdrant entries were extracted before storePersonEmbeddings() was added`);
        }
        if (qdrantPersonEntries.length === 0 && neo4jPersons.length > 0) {
            console.log(`  ⚠ No person Qdrant entries yet — storePersonEmbeddings() runs for calls made with new pipeline`);
        }

        // --- Qdrant event entries ↔ Neo4j significant highlights ---
        console.log('\n--- Qdrant event entries ↔ Neo4j Significant Highlights (score >= 7) ---');
        const neo4jSignificantIds = new Set(
            neo4jHighlights
                .filter(h => (h.importanceScore ?? 0) >= 7)
                .map(h => h.qdrantPointId)
                .filter((id): id is string => Boolean(id))
        );
        const qdrantEventPointIds = new Set(qdrantEventEntries.map(p => p.payload.metadata?.qdrantPointId ?? p.payload.qdrantPointId).filter(Boolean));

        console.log(`Neo4j highlights with importanceScore >= 7: ${neo4jSignificantIds.size}`);
        console.log(`Qdrant event entries: ${qdrantEventEntries.length}`);
        if (neo4jSignificantIds.size > 0) {
            const eventsWithQdrant = [...neo4jSignificantIds].filter(id => qdrantEventPointIds.has(id));
            const eventsMissingQdrant = [...neo4jSignificantIds].filter(id => !qdrantEventPointIds.has(id));
            console.log(`Significant highlights with Qdrant event entry: ${eventsWithQdrant.length}/${neo4jSignificantIds.size}`);
            if (eventsMissingQdrant.length > 0) {
                console.log(`  Missing Qdrant event entries: ${eventsMissingQdrant.slice(0, 5).map(id => id.slice(0, 8) + '...').join(', ')}`);
                console.log(`  Note: highlights from calls before this pipeline version won't have event entries`);
            }
        } else if (qdrantEventEntries.length === 0) {
            console.log(`No significant highlights or event entries yet — will appear after calls with importanceScore >= 7`);
        }

        // --- Postgres ↔ Neo4j topic consistency ---
        console.log('\n--- Postgres ↔ Neo4j Topic Consistency ---');
        const neo4jTopicIds = new Set(neo4jTopics.map(t => t.topicId).filter((id): id is string => Boolean(id)));

        const topicsInBoth = [...pgTopicIds].filter(id => neo4jTopicIds.has(id));
        const topicsInPgOnly = [...pgTopicIds].filter(id => !neo4jTopicIds.has(id));
        const topicsInNeo4jOnly = [...neo4jTopicIds].filter(id => !pgTopicIds.has(id));

        console.log(`In both: ${topicsInBoth.length}`);
        console.log(`In Postgres only: ${topicsInPgOnly.length}`);
        console.log(`In Neo4j only: ${topicsInNeo4jOnly.length}`);

        if (topicsInPgOnly.length > 0) {
            const pgOnlyLabels = pgTopics.filter(t => topicsInPgOnly.includes(t.id)).map(t => t.topicName);
            console.log(`  Postgres-only: ${pgOnlyLabels.join(', ')}`);
        }
        if (topicsInNeo4jOnly.length > 0) {
            const neo4jOnlyLabels = neo4jTopics
                .filter((t): t is { topicId: string; label: string | null } => {
                    const topicId = t.topicId;
                    return topicId != null && topicsInNeo4jOnly.includes(topicId);
                })
                .map(t => t.label ?? '(missing label)');
            console.log(`  Neo4j-only: ${neo4jOnlyLabels.join(', ')}`);
        }

        // --- Call events (Postgres) ---
        console.log('\n--- Call Events (Postgres) ---');
        if (pgCallEvents.length === 0) {
            console.log('No call events recorded for this user');
            console.log('These are written when the LLM calls flagCallEvent() during a live call');
        } else {
            console.log(`Total call events: ${pgCallEvents.length}`);
            const byType = new Map<string, number>();
            for (const e of pgCallEvents) {
                byType.set(e.eventType, (byType.get(e.eventType) ?? 0) + 1);
            }
            for (const [type, count] of byType) {
                console.log(`  ${type}: ${count}`);
            }
            console.log('\nMost recent events:');
            for (const e of pgCallEvents.slice(0, 5)) {
                console.log(`  [${e.eventType}] severity=${e.severity ?? 'unset'} detectedAt=${new Date(e.detectedAt).toISOString().slice(0, 16)}`);
                console.log(`    "${e.description}"`);
            }
        }

        // --- Per-conversation consistency ---
        console.log('\n--- Per-Conversation Consistency ---');
        const qdrantByConversation = new Map<string, string[]>();
        for (const p of qdrantHighlights) {
            const cid = p.payload.metadata?.conversationId || p.payload.conversationId;
            if (!cid) continue;
            if (!qdrantByConversation.has(cid)) qdrantByConversation.set(cid, []);
            qdrantByConversation.get(cid)!.push(getQdrantPointId(p));
        }

        const neo4jConvIds = new Set(neo4jConversations.map(c => c.conversationId).filter((id): id is string => Boolean(id)));
        const pgConvIds = new Set(pgSummaries.map(s => s.conversationId).filter(Boolean));

        const allConvIds = new Set([...qdrantByConversation.keys(), ...neo4jConvIds, ...pgConvIds]);
        let consistentConvs = 0;
        let inconsistentConvs = 0;

        for (const cid of allConvIds) {
            const inQdrant = qdrantByConversation.has(cid);
            const inNeo4j = neo4jConvIds.has(cid);
            const inPg = pgConvIds.has(cid);

            if (inQdrant && inNeo4j && inPg) {
                consistentConvs++;
            } else {
                inconsistentConvs++;
                if (inconsistentConvs <= 5) {
                    const missing = [];
                    if (!inQdrant) missing.push('Qdrant');
                    if (!inNeo4j) missing.push('Neo4j');
                    if (!inPg) missing.push('Postgres');
                    console.log(`  ${cid.slice(0, 12)}... missing from: ${missing.join(', ')}`);
                }
            }
        }

        console.log(`\nConsistent conversations (in all 3): ${consistentConvs}/${allConvIds.size}`);
        console.log(`Inconsistent conversations: ${inconsistentConvs}/${allConvIds.size}`);

        // --- Summary ---
        console.log('\n--- Overall Consistency Score ---');
        const scores: Array<{ label: string; score: number }> = [];

        if (qdrantHighlightIds.size > 0)
            scores.push({ label: 'Qdrant highlights ↔ Neo4j', score: highlightsInBoth.length / qdrantHighlightIds.size });
        if (pgTopicIds.size > 0)
            scores.push({ label: 'Postgres topics ↔ Neo4j', score: topicsInBoth.length / pgTopicIds.size });
        if (allConvIds.size > 0)
            scores.push({ label: 'Per-conversation (all 3 stores)', score: consistentConvs / allConvIds.size });
        if (pgTopicIds.size > 0)
            scores.push({ label: 'Postgres topics → Qdrant coverage', score: topicsInBothStores.length / pgTopicIds.size });
        if (neo4jPersonIds.size > 0)
            scores.push({ label: 'Neo4j persons → Qdrant coverage', score: personsInBoth.length / neo4jPersonIds.size });

        for (const { label, score } of scores) {
            const pct = (score * 100).toFixed(0);
            const flag = score < 0.5 ? ' ⚠' : score < 0.8 ? '' : '';
            console.log(`  ${label}: ${pct}%${flag}`);
        }

        const overallScore = scores.length > 0
            ? (scores.reduce((a, b) => a + b.score, 0) / scores.length * 100).toFixed(0)
            : 'N/A';
        console.log(`\nOverall (avg): ${overallScore}%`);
        console.log('Note: topic/person Qdrant coverage will be 0% until a call runs with the new pipeline version');

        console.log('\n=== AUDIT COMPLETE ===');
    } finally {
        await prisma.$disconnect();
        await driver.close();
    }
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
