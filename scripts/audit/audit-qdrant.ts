/**
 * Qdrant data quality audit for a given userId.
 *
 * Usage: npx tsx scripts/audit/audit-qdrant.ts [userId]
 *   If no userId provided, finds the user with the most data.
 *
 * Prerequisites: QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION, DATABASE_URL in .env
 */
import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/index.js';

const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;
const COLLECTION = process.env.QDRANT_COLLECTION!;

interface QdrantPoint {
    id: string;
    payload: Record<string, any>;
    vector?: number[];
}

async function qdrantScroll(filter: Record<string, any>, withVector = false): Promise<QdrantPoint[]> {
    const allPoints: QdrantPoint[] = [];
    let offset: string | null = null;

    while (true) {
        const body: Record<string, any> = {
            filter,
            limit: 100,
            with_payload: true,
            with_vector: withVector,
        };
        if (offset) body.offset = offset;

        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Qdrant scroll failed (${res.status}): ${text}`);
        }

        const data = await res.json();
        const points = data.result?.points ?? [];
        allPoints.push(...points);

        if (!data.result?.next_page_offset) break;
        offset = data.result.next_page_offset;
    }

    return allPoints;
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
    const userId = process.argv[2] || await findBestUserId();

    console.log('=== QDRANT DATA AUDIT ===');
    console.log(`User ID: ${userId}`);
    console.log(`Collection: ${COLLECTION}`);
    console.log(`Qdrant URL: ${QDRANT_URL}\n`);

    // Fetch all points for this user
    const points = await qdrantScroll({
        must: [{ key: 'userId', match: { value: userId } }],
    });

    console.log(`--- Overview ---`);
    console.log(`Total vectors: ${points.length}`);

    if (points.length === 0) {
        console.log('\nNo vectors found for this user. Audit complete.');
        return;
    }

    // Unique conversations
    const conversationIds = new Set(points.map(p => p.payload.conversationId).filter(Boolean));
    console.log(`Unique conversations: ${conversationIds.size}`);

    // Date range
    const dates = points
        .map(p => p.payload.createdAt)
        .filter(Boolean)
        .sort();
    if (dates.length > 0) {
        console.log(`Date range: ${dates[0]} → ${dates[dates.length - 1]}`);
    }

    // --- Chunk quality ---
    console.log(`\n--- Chunk Quality ---`);
    const texts = points.map(p => p.payload.pageContent || p.payload.text || '');
    const textLengths = texts.map((t: string) => t.length);
    const avgLength = textLengths.reduce((a: number, b: number) => a + b, 0) / textLengths.length;
    const emptyTexts = texts.filter((t: string) => t.trim().length === 0);
    const shortTexts = texts.filter((t: string) => t.trim().length > 0 && t.trim().length < 20);

    console.log(`Average text length: ${avgLength.toFixed(0)} chars`);
    console.log(`Empty texts: ${emptyTexts.length}`);
    console.log(`Very short texts (<20 chars): ${shortTexts.length}`);
    console.log(`Text length distribution:`);
    const buckets = { '0-20': 0, '21-50': 0, '51-100': 0, '101-200': 0, '200+': 0 };
    for (const len of textLengths) {
        if (len <= 20) buckets['0-20']++;
        else if (len <= 50) buckets['21-50']++;
        else if (len <= 100) buckets['51-100']++;
        else if (len <= 200) buckets['101-200']++;
        else buckets['200+']++;
    }
    for (const [range, count] of Object.entries(buckets)) {
        console.log(`  ${range}: ${count} (${((count / points.length) * 100).toFixed(0)}%)`);
    }

    // --- Metadata completeness ---
    console.log(`\n--- Metadata Completeness ---`);
    const requiredFields = ['userId', 'conversationId', 'createdAt', 'summaryId'];
    for (const field of requiredFields) {
        const present = points.filter(p => p.payload[field] != null).length;
        const pct = ((present / points.length) * 100).toFixed(0);
        const status = present === points.length ? 'OK' : 'MISSING';
        console.log(`  ${field}: ${present}/${points.length} (${pct}%) ${status !== 'OK' ? `⚠ ${status}` : ''}`);
    }

    // Check for qdrantPointId in metadata (needed for KG cross-reference)
    const hasQdrantPointId = points.filter(p => p.payload.qdrantPointId != null).length;
    console.log(`  qdrantPointId (in payload): ${hasQdrantPointId}/${points.length} (${((hasQdrantPointId / points.length) * 100).toFixed(0)}%)`);

    // --- Duplicate detection ---
    console.log(`\n--- Duplicate Detection ---`);
    const textSet = new Map<string, string[]>();
    for (const p of points) {
        const text = (p.payload.pageContent || p.payload.text || '').trim().toLowerCase();
        if (!textSet.has(text)) textSet.set(text, []);
        textSet.get(text)!.push(p.id as string);
    }
    const exactDuplicates = Array.from(textSet.entries()).filter(([, ids]) => ids.length > 1);
    console.log(`Exact text duplicates: ${exactDuplicates.length} groups`);
    for (const [text, ids] of exactDuplicates.slice(0, 5)) {
        console.log(`  "${text.slice(0, 60)}..." — ${ids.length} copies`);
    }

    // --- Sample output ---
    console.log(`\n--- Sample Highlights (up to 10) ---`);
    const sample = points.slice(0, 10);
    for (const p of sample) {
        const text = (p.payload.pageContent || p.payload.text || '').slice(0, 100);
        console.log(`  [${(p.id as string).slice(0, 8)}...] "${text}${text.length >= 100 ? '...' : ''}"`);
        console.log(`    conversationId=${p.payload.conversationId || 'MISSING'} createdAt=${p.payload.createdAt || 'MISSING'}`);
    }

    // --- Near-duplicate detection (if vectors available) ---
    console.log(`\n--- Near-Duplicate Detection (via re-fetch with vectors) ---`);
    if (points.length <= 200) {
        const pointsWithVectors = await qdrantScroll(
            { must: [{ key: 'userId', match: { value: userId } }] },
            true
        );

        const withVectors = pointsWithVectors.filter(p => p.vector && Array.isArray(p.vector));
        if (withVectors.length >= 2) {
            let nearDuplicates = 0;
            const nearDupPairs: Array<{ a: string; b: string; sim: number; textA: string; textB: string }> = [];

            for (let i = 0; i < withVectors.length; i++) {
                for (let j = i + 1; j < withVectors.length; j++) {
                    const sim = cosineSimilarity(withVectors[i].vector!, withVectors[j].vector!);
                    if (sim > 0.95) {
                        nearDuplicates++;
                        if (nearDupPairs.length < 5) {
                            nearDupPairs.push({
                                a: (withVectors[i].id as string).slice(0, 8),
                                b: (withVectors[j].id as string).slice(0, 8),
                                sim,
                                textA: (withVectors[i].payload.pageContent || withVectors[i].payload.text || '').slice(0, 50),
                                textB: (withVectors[j].payload.pageContent || withVectors[j].payload.text || '').slice(0, 50),
                            });
                        }
                    }
                }
            }

            console.log(`Near-duplicate pairs (cosine > 0.95): ${nearDuplicates}`);
            for (const pair of nearDupPairs) {
                console.log(`  ${pair.a}... <-> ${pair.b}... (sim=${pair.sim.toFixed(4)})`);
                console.log(`    A: "${pair.textA}..."`);
                console.log(`    B: "${pair.textB}..."`);
            }
        } else {
            console.log('Not enough vectors with embeddings for near-duplicate analysis');
        }
    } else {
        console.log(`Skipping (${points.length} points > 200 limit for pairwise comparison)`);
    }

    console.log('\n=== AUDIT COMPLETE ===');
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});