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

const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;
const COLLECTION = process.env.QDRANT_COLLECTION!;

type QdrantPayload = Record<string, any> & {
    qdrantPointId?: string;
    conversationId?: string;
};

interface QdrantPoint {
    id: string;
    payload: QdrantPayload;
}

function getQdrantPointId(point: QdrantPoint): string {
    return point.payload.qdrantPointId || point.id;
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

        // Postgres: summaries and topics
        const pgSummaries = await prisma.conversationSummary.findMany({
            where: { elderlyProfileId: userId },
            include: { conversationTopicRefs: { include: { conversationTopic: true } } },
        });
        const pgTopics = await prisma.conversationTopic.findMany({
            where: { elderlyProfileId: userId },
        });

        // Qdrant: all vectors for user
        const qdrantPoints = await qdrantScroll({
            must: [{ key: 'userId', match: { value: userId } }],
        });

        // Neo4j: highlights and topics
        const neo4jHighlights = await runNeo4j<{ qdrantPointId: string | null; text: string | null }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c)-[:HAS_HIGHLIGHT]->(h:Highlight)
             RETURN h.qdrantPointId AS qdrantPointId, h.text AS text`, { userId });

        const neo4jTopics = await runNeo4j<{ topicId: string | null; label: string | null }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONS]->(t:Topic)
             RETURN t.topicId AS topicId, t.label AS label`, { userId });

        const neo4jConversations = await runNeo4j<{ conversationId: string | null }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c:Conversation)
             RETURN c.conversationId AS conversationId`, { userId });

        // --- Overview ---
        console.log('--- Store Counts ---');
        console.log(`Postgres summaries: ${pgSummaries.length}`);
        console.log(`Postgres topics: ${pgTopics.length}`);
        console.log(`Qdrant vectors: ${qdrantPoints.length}`);
        console.log(`Neo4j highlights: ${neo4jHighlights.length}`);
        console.log(`Neo4j topics: ${neo4jTopics.length}`);
        console.log(`Neo4j conversations: ${neo4jConversations.length}`);

        // --- Qdrant ↔ Neo4j highlight consistency ---
        console.log('\n--- Qdrant ↔ Neo4j Highlight Consistency ---');
        const qdrantIds = new Set(qdrantPoints.map(getQdrantPointId));
        const neo4jIds = new Set(neo4jHighlights.map(h => h.qdrantPointId).filter((id): id is string => Boolean(id)));

        const inQdrantOnly = [...qdrantIds].filter(id => !neo4jIds.has(id));
        const inNeo4jOnly = [...neo4jIds].filter(id => !qdrantIds.has(id));
        const inBoth = [...qdrantIds].filter(id => neo4jIds.has(id));

        console.log(`In both: ${inBoth.length}`);
        console.log(`In Qdrant only (missing from Neo4j): ${inQdrantOnly.length}`);
        console.log(`In Neo4j only (missing from Qdrant): ${inNeo4jOnly.length}`);

        if (inQdrantOnly.length > 0) {
            console.log(`  Qdrant-only samples: ${inQdrantOnly.slice(0, 5).map(id => id.slice(0, 8) + '...').join(', ')}`);
        }
        if (inNeo4jOnly.length > 0) {
            console.log(`  Neo4j-only samples: ${inNeo4jOnly.slice(0, 5).map(id => id.slice(0, 8) + '...').join(', ')}`);
        }

        const highlightConsistency = qdrantIds.size > 0
            ? (inBoth.length / qdrantIds.size * 100).toFixed(0)
            : 'N/A';
        console.log(`Consistency score: ${highlightConsistency}%`);

        // --- Postgres ↔ Neo4j topic consistency ---
        console.log('\n--- Postgres ↔ Neo4j Topic Consistency ---');
        const pgTopicIds = new Set(pgTopics.map(t => t.id));
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

        // --- Per-conversation consistency ---
        console.log('\n--- Per-Conversation Consistency ---');
        const qdrantByConversation = new Map<string, string[]>();
        for (const p of qdrantPoints) {
            const cid = p.payload.conversationId;
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
        const scores = [];
        if (qdrantIds.size > 0) scores.push(inBoth.length / qdrantIds.size);
        if (pgTopicIds.size > 0) scores.push(topicsInBoth.length / pgTopicIds.size);
        if (allConvIds.size > 0) scores.push(consistentConvs / allConvIds.size);

        const overallScore = scores.length > 0
            ? (scores.reduce((a, b) => a + b, 0) / scores.length * 100).toFixed(0)
            : 'N/A';
        console.log(`Overall: ${overallScore}%`);

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
