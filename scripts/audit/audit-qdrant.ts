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

    const getField = (p: QdrantPoint, field: string) =>
        p.payload.metadata?.[field] ?? p.payload[field] ?? null;
    const getText = (p: QdrantPoint) =>
        p.payload.content ?? p.payload.pageContent ?? p.payload.text ?? '';

    // Fetch all points for this user
    const points = await qdrantScroll({
        must: [{ key: 'metadata.userId', match: { value: userId } }],
    });

    console.log(`--- Overview ---`);
    console.log(`Total vectors: ${points.length}`);

    if (points.length === 0) {
        console.log('\nNo vectors found for this user. Audit complete.');
        return;
    }

    // Unique conversations
    const conversationIds = new Set(points.map(p => getField(p, 'conversationId')).filter(Boolean));
    console.log(`Unique conversations: ${conversationIds.size}`);

    // Date range
    const dates = points
        .map(p => getField(p, 'createdAt'))
        .filter(Boolean)
        .sort();
    if (dates.length > 0) {
        console.log(`Date range: ${dates[0]} → ${dates[dates.length - 1]}`);
    }

    // --- Entry type breakdown ---
    console.log(`\n--- Entry Type Breakdown ---`);
    const byType = new Map<string, QdrantPoint[]>();
    for (const p of points) {
        const type = getField(p, 'type') ?? 'highlight'; // default for legacy entries
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type)!.push(p);
    }
    const typeOrder = ['highlight', 'topic', 'person', 'event'];
    const allTypes = [...new Set([...typeOrder, ...byType.keys()])];
    for (const type of allTypes) {
        const typePoints = byType.get(type) ?? [];
        const pct = ((typePoints.length / points.length) * 100).toFixed(0);
        console.log(`  ${type}: ${typePoints.length} (${pct}%)`);
    }

    const highlights = byType.get('highlight') ?? [];
    const topicEntries = byType.get('topic') ?? [];
    const personEntries = byType.get('person') ?? [];
    const eventEntries = byType.get('event') ?? [];
    const legacyEntries = points.filter(p => getField(p, 'type') == null);

    if (legacyEntries.length > 0) {
        console.log(`  (${legacyEntries.length} entries have no 'type' field — treated as legacy highlights)`);
    }

    // --- Highlight quality (type=highlight only) ---
    const highlightPool = highlights.length > 0 ? highlights : legacyEntries;
    console.log(`\n--- Highlight Chunk Quality (${highlightPool.length} entries) ---`);
    if (highlightPool.length > 0) {
        const texts = highlightPool.map(p => getText(p));
        const textLengths = texts.map((t: string) => t.length);
        const avgLength = textLengths.reduce((a: number, b: number) => a + b, 0) / textLengths.length;
        const emptyTexts = texts.filter((t: string) => t.trim().length === 0);

        console.log(`Average text length: ${avgLength.toFixed(0)} chars`);
        console.log(`Empty texts: ${emptyTexts.length}`);
        console.log(`Text length distribution:`);
        const buckets = { '0-20': 0, '21-50': 0, '51-80': 0, '81-150': 0, '151+': 0 };
        for (const len of textLengths) {
            if (len <= 20) buckets['0-20']++;
            else if (len <= 50) buckets['21-50']++;
            else if (len <= 80) buckets['51-80']++;
            else if (len <= 150) buckets['81-150']++;
            else buckets['151+']++;
        }
        for (const [range, count] of Object.entries(buckets)) {
            const flag = range === '81-150' ? ' ← target range' : '';
            console.log(`  ${range}: ${count} (${((count / highlightPool.length) * 100).toFixed(0)}%)${flag}`);
        }
        const aboveThreshold = textLengths.filter((l: number) => l >= 80).length;
        const pctAbove = ((aboveThreshold / highlightPool.length) * 100).toFixed(0);
        const thresholdStatus = aboveThreshold === highlightPool.length ? 'all richer highlights'
            : aboveThreshold > highlightPool.length / 2 ? 'majority richer (some pre-improvement highlights remain)'
            : '⚠ majority still short — check prompt or recent call logs';
        console.log(`\nHighlights >= 80 chars: ${aboveThreshold}/${highlightPool.length} (${pctAbove}%) — ${thresholdStatus}`);
    }

    // --- Topic entries ---
    if (topicEntries.length > 0) {
        console.log(`\n--- Topic Entries (${topicEntries.length}) ---`);
        const missingTopicId = topicEntries.filter(p => getField(p, 'topicId') == null).length;
        const missingLabel = topicEntries.filter(p => getField(p, 'label') == null).length;
        console.log(`  Missing topicId: ${missingTopicId} ${missingTopicId > 0 ? '⚠' : ''}`);
        console.log(`  Missing label: ${missingLabel} ${missingLabel > 0 ? '⚠' : ''}`);
        console.log(`  Sample labels: ${topicEntries.slice(0, 8).map(p => getField(p, 'label') ?? getText(p).slice(0, 30)).join(', ')}`);
    } else {
        console.log(`\n--- Topic Entries: 0 ---`);
        console.log(`  ⚠ No topic entries found — these are written during post-call updateTopics()`);
        console.log(`  Expected after calls with new pipeline version`);
    }

    // --- Person entries ---
    if (personEntries.length > 0) {
        console.log(`\n--- Person Entries (${personEntries.length}) ---`);
        const missingPersonId = personEntries.filter(p => getField(p, 'personId') == null).length;
        const missingName = personEntries.filter(p => getField(p, 'name') == null).length;
        console.log(`  Missing personId: ${missingPersonId} ${missingPersonId > 0 ? '⚠' : ''}`);
        console.log(`  Missing name: ${missingName} ${missingName > 0 ? '⚠' : ''}`);
        console.log(`  Sample names/roles: ${personEntries.slice(0, 8).map(p => getText(p).slice(0, 40)).join(', ')}`);
    } else {
        console.log(`\n--- Person Entries: 0 ---`);
        console.log(`  ⚠ No person entries found — these are written during post-call storePersonEmbeddings()`);
        console.log(`  Expected after calls with new pipeline version`);
    }

    // --- Event entries ---
    if (eventEntries.length > 0) {
        console.log(`\n--- Event Entries (importanceScore >= 7) (${eventEntries.length}) ---`);
        console.log(`  Sample events:`);
        for (const p of eventEntries.slice(0, 5)) {
            const text = getText(p).slice(0, 80);
            console.log(`    "${text}${text.length >= 80 ? '...' : ''}"`);
        }
    } else {
        console.log(`\n--- Event Entries: 0 ---`);
        console.log(`  No high-importance events stored yet (threshold: importanceScore >= 7)`);
        console.log(`  These are written in storeEmbeddings() for significant highlights`);
    }

    // --- Metadata completeness (all entries) ---
    console.log(`\n--- Metadata Completeness (all ${points.length} entries) ---`);
    const requiredFields = ['userId', 'conversationId', 'createdAt'];
    for (const field of requiredFields) {
        const present = points.filter(p => getField(p, field) != null).length;
        const pct = ((present / points.length) * 100).toFixed(0);
        console.log(`  ${field}: ${present}/${points.length} (${pct}%) ${present < points.length ? '⚠ MISSING on some' : ''}`);
    }
    // summaryId expected only on highlight/event entries
    const summaryIdExpected = [...highlights, ...eventEntries, ...legacyEntries];
    if (summaryIdExpected.length > 0) {
        const hasSummaryId = summaryIdExpected.filter(p => getField(p, 'summaryId') != null).length;
        console.log(`  summaryId (highlight/event): ${hasSummaryId}/${summaryIdExpected.length} ${hasSummaryId < summaryIdExpected.length ? '⚠ MISSING on some' : ''}`);
    }
    const hasQdrantPointId = [...highlights, ...eventEntries, ...legacyEntries].filter(p => getField(p, 'qdrantPointId') != null).length;
    console.log(`  qdrantPointId (highlight/event): ${hasQdrantPointId}/${summaryIdExpected.length}`);

    // type field coverage
    const hasType = points.filter(p => getField(p, 'type') != null).length;
    console.log(`  type field: ${hasType}/${points.length} — ${points.length - hasType} legacy entries without type`);

    // --- Duplicate detection (highlight pool only) ---
    if (highlightPool.length > 0) {
        console.log(`\n--- Duplicate Detection (highlights) ---`);
        const textSet = new Map<string, string[]>();
        for (const p of highlightPool) {
            const text = getText(p).trim().toLowerCase();
            if (!textSet.has(text)) textSet.set(text, []);
            textSet.get(text)!.push(p.id as string);
        }
        const exactDuplicates = Array.from(textSet.entries()).filter(([, ids]) => ids.length > 1);
        console.log(`Exact text duplicates: ${exactDuplicates.length} groups`);
        for (const [text, ids] of exactDuplicates.slice(0, 5)) {
            console.log(`  "${text.slice(0, 60)}..." — ${ids.length} copies`);
        }
    }

    // --- Sample output by type ---
    console.log(`\n--- Sample Entries by Type (up to 5 each) ---`);
    for (const type of allTypes) {
        const typePoints = byType.get(type) ?? [];
        if (typePoints.length === 0) continue;
        console.log(`\n  [${type}]`);
        for (const p of typePoints.slice(0, 5)) {
            const text = getText(p).slice(0, 80);
            const extra = type === 'topic' ? ` label="${getField(p, 'label') ?? ''}"` :
                          type === 'person' ? ` name="${getField(p, 'name') ?? ''}" role="${getField(p, 'role') ?? ''}"` :
                          type === 'event' ? `` : '';
            console.log(`    [${(p.id as string).slice(0, 8)}...] "${text}${text.length >= 80 ? '...' : ''}"${extra}`);
        }
    }

    // --- Near-duplicate detection (highlights only) ---
    console.log(`\n--- Near-Duplicate Detection (highlights, cosine > 0.95) ---`);
    if (highlightPool.length >= 2 && highlightPool.length <= 200) {
        // Fetch all user vectors with embeddings, then filter to highlights in memory
        // (metadata.type has no payload index in Qdrant Cloud — cannot filter server-side)
        const allWithVectors = await qdrantScroll(
            { must: [{ key: 'metadata.userId', match: { value: userId } }] },
            true
        );
        // Keep only highlight-type entries (or legacy entries without a type field)
        const vectorSource = allWithVectors.filter(p => {
            const t = p.payload.metadata?.type ?? p.payload.type;
            return !t || t === 'highlight';
        });

        const withVectors = vectorSource.filter(p => p.vector && Array.isArray(p.vector));
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
    } else if (highlightPool.length > 200) {
        console.log(`Skipping (${highlightPool.length} highlights > 200 limit for pairwise comparison)`);
    } else {
        console.log('Not enough highlights for near-duplicate analysis');
    }

    console.log('\n=== AUDIT COMPLETE ===');
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});