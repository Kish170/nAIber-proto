/**
 * Embedding quality audit — checks for near-duplicates, clustering, and
 * tests representative queries against the vector collection.
 *
 * Usage: npx tsx scripts/audit/audit-embeddings.ts [userId]
 *
 * Prerequisites: QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION, OPENAI_API_KEY, DATABASE_URL in .env
 */
import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/index.js';
import { OpenAIClient } from '@naiber/shared-clients';
import { EmbeddingService } from '@naiber/shared-services';

const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;
const COLLECTION = process.env.QDRANT_COLLECTION!;

async function findBestUserId(): Promise<{ userId: string; name: string }> {
    const prisma = new PrismaClient();
    try {
        const profiles = await prisma.elderlyProfile.findMany({
            include: { _count: { select: { conversationSummaries: true } } },
        });
        const best = profiles.sort((a, b) => b._count.conversationSummaries - a._count.conversationSummaries)[0];
        if (!best) throw new Error('No profiles found');
        console.log(`Auto-selected user: "${best.name}" (${best.id})\n`);
        return { userId: best.id, name: best.name };
    } finally {
        await prisma.$disconnect();
    }
}

async function qdrantScroll(filter: Record<string, any>, withVector = false): Promise<Array<{ id: string; payload: Record<string, any>; vector?: number[] }>> {
    const allPoints: any[] = [];
    let offset: string | null = null;

    while (true) {
        const body: Record<string, any> = { filter, limit: 100, with_payload: true, with_vector: withVector };
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

async function qdrantSearch(vector: number[], userId: string, limit = 10): Promise<Array<{ id: string; score: number; payload: Record<string, any> }>> {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
        },
        body: JSON.stringify({
            vector,
            limit,
            filter: { must: [{ key: 'userId', match: { value: userId } }] },
            with_payload: true,
        }),
    });

    if (!res.ok) throw new Error(`Qdrant search failed: ${res.status}`);
    const data = await res.json();
    return data.result ?? [];
}

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function main() {
    const userId = process.argv[2] || (await findBestUserId()).userId;

    console.log('=== EMBEDDING QUALITY AUDIT ===');
    console.log(`User ID: ${userId}\n`);

    // Fetch all vectors
    console.log('Fetching vectors (with embeddings)...');
    const points = await qdrantScroll(
        { must: [{ key: 'userId', match: { value: userId } }] },
        true
    );
    const withVectors = points.filter(p => p.vector && Array.isArray(p.vector));
    console.log(`Total points: ${points.length}, with vectors: ${withVectors.length}`);

    if (withVectors.length === 0) {
        console.log('No vectors found. Audit complete.');
        return;
    }

    // --- Dimensionality check ---
    const dims = new Set(withVectors.map(p => p.vector!.length));
    console.log(`\n--- Dimensionality ---`);
    console.log(`Dimensions found: ${Array.from(dims).join(', ')}`);
    if (dims.size > 1) {
        console.log('⚠ MIXED DIMENSIONS — this will cause retrieval issues');
    }

    // --- Near-duplicate clustering ---
    console.log(`\n--- Near-Duplicate Clustering ---`);
    if (withVectors.length > 500) {
        console.log(`Skipping pairwise analysis (${withVectors.length} vectors > 500 limit)`);
    } else {
        const clusters: Array<{ indices: number[]; avgSim: number }> = [];
        const assigned = new Set<number>();

        for (let i = 0; i < withVectors.length; i++) {
            if (assigned.has(i)) continue;
            const cluster = [i];
            for (let j = i + 1; j < withVectors.length; j++) {
                if (assigned.has(j)) continue;
                const sim = cosineSimilarity(withVectors[i].vector!, withVectors[j].vector!);
                if (sim > 0.95) {
                    cluster.push(j);
                    assigned.add(j);
                }
            }
            if (cluster.length > 1) {
                assigned.add(i);
                // Compute average intra-cluster similarity
                let totalSim = 0, pairs = 0;
                for (let a = 0; a < cluster.length; a++) {
                    for (let b = a + 1; b < cluster.length; b++) {
                        totalSim += cosineSimilarity(withVectors[cluster[a]].vector!, withVectors[cluster[b]].vector!);
                        pairs++;
                    }
                }
                clusters.push({ indices: cluster, avgSim: pairs > 0 ? totalSim / pairs : 1 });
            }
        }

        console.log(`Near-duplicate clusters (cosine > 0.95): ${clusters.length}`);
        console.log(`Points in clusters: ${clusters.reduce((s, c) => s + c.indices.length, 0)} / ${withVectors.length}`);

        for (const cluster of clusters.slice(0, 5)) {
            console.log(`\n  Cluster (${cluster.indices.length} points, avg sim=${cluster.avgSim.toFixed(4)}):`);
            for (const idx of cluster.indices.slice(0, 3)) {
                const text = (withVectors[idx].payload.pageContent || withVectors[idx].payload.text || '').slice(0, 80);
                console.log(`    "${text}${text.length >= 80 ? '...' : ''}"`);
            }
            if (cluster.indices.length > 3) {
                console.log(`    ... and ${cluster.indices.length - 3} more`);
            }
        }
    }

    // --- Representative query testing ---
    console.log(`\n--- Representative Query Testing ---`);
    const embService = new EmbeddingService(
        OpenAIClient.getInstance({
            apiKey: process.env.OPENAI_API_KEY!,
            baseUrl: process.env.OPENAI_BASE_URL,
        })
    );

    // Get user's topics from Postgres for query generation
    const prisma = new PrismaClient();
    const topics = await prisma.conversationTopic.findMany({
        where: { elderlyProfileId: userId },
        select: { topicName: true },
        take: 5,
    });
    await prisma.$disconnect();

    const testQueries = [
        ...(topics.length > 0 ? [`Tell me about ${topics[0].topicName}`] : []),
        'How have you been feeling?',
        'quantum computing research',
        'What did we talk about last time?',
    ];

    for (const query of testQueries) {
        const { embedding } = await embService.generateEmbedding(query);
        const results = await qdrantSearch(embedding, userId, 5);

        console.log(`\n  Query: "${query}"`);
        if (results.length === 0) {
            console.log(`    No results`);
        } else {
            for (const r of results) {
                const text = (r.payload.pageContent || r.payload.text || '').slice(0, 60);
                console.log(`    score=${r.score.toFixed(4)} "${text}${text.length >= 60 ? '...' : ''}"`);
            }
            const scores = results.map(r => r.score);
            const above045 = scores.filter(s => s > 0.45).length;
            console.log(`    Above threshold (0.45): ${above045}/${results.length}`);
        }
    }

    // --- Topic embedding drift analysis ---
    console.log(`\n--- Topic Embedding Drift Analysis ---`);
    const prisma2 = new PrismaClient();
    const topicsWithEmbeddings = await prisma2.conversationTopic.findMany({
        where: { elderlyProfileId: userId },
        select: { id: true, topicName: true, topicEmbedding: true },
    });
    await prisma2.$disconnect();

    if (topicsWithEmbeddings.length === 0) {
        console.log('No topics with embeddings found.');
    } else {
        let driftCount = 0;
        for (const topic of topicsWithEmbeddings) {
            const stored = (topic.topicEmbedding ?? []) as number[];
            if (stored.length === 0) {
                console.log(`  "${topic.topicName}" — no stored embedding`);
                continue;
            }

            const { embedding: fresh } = await embService.generateEmbedding(topic.topicName);
            const drift = 1 - cosineSimilarity(stored, fresh);

            const flag = drift > 0.1 ? '⚠ SIGNIFICANT DRIFT' : '';
            if (drift > 0.05 || flag) {
                console.log(`  "${topic.topicName}" — drift=${drift.toFixed(4)} ${flag}`);
                driftCount++;
            }
        }

        if (driftCount === 0) {
            console.log('  No significant drift detected in any topic embeddings.');
        } else {
            console.log(`\n  ${driftCount}/${topicsWithEmbeddings.length} topics show drift > 0.05`);
        }
    }

    console.log('\n=== AUDIT COMPLETE ===');
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
