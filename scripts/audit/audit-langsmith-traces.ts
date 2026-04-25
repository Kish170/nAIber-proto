/**
 * Pull and analyze recent GeneralPostCallGraph traces from LangSmith.
 * Inspects NER outputs, summary quality, embedding writes, and KG population results.
 *
 * Usage: npx tsx scripts/audit/audit-langsmith-traces.ts [--limit 20]
 *
 * Prerequisites: LANGCHAIN_API_KEY in .env
 */
import 'dotenv/config';
import { Client } from 'langsmith';

const PROJECT_NAME = process.env.LANGCHAIN_PROJECT || 'naiber-llm-postcall';

interface TraceStats {
    totalRuns: number;
    withSummary: number;
    withHighlights: number;
    withPersons: number;
    withKGNodes: number;
    withKGRelationships: number;
    withErrors: number;
    emptyNER: number;
    emptyHighlights: number;
    avgHighlightCount: number;
    avgPersonCount: number;
    avgTopicCount: number;
}

async function main() {
    const apiKey = process.env.LANGCHAIN_API_KEY;
    if (!apiKey) {
        console.error('LANGCHAIN_API_KEY not set');
        process.exit(1);
    }

    const limitArg = process.argv.indexOf('--limit');
    const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : 20;

    const client = new Client({ apiKey });

    console.log('=== LANGSMITH TRACE AUDIT ===');
    console.log(`Project: ${PROJECT_NAME}`);
    console.log(`Limit: ${limit} most recent traces\n`);

    // Fetch recent root runs from the post-call project
    const runs: any[] = [];
    for await (const run of client.listRuns({
        projectName: PROJECT_NAME,
        isRoot: true,
        limit,
    })) {
        runs.push(run);
    }

    if (runs.length === 0) {
        console.log('No traces found. Make sure:');
        console.log('  1. LANGCHAIN_TRACING_V2=true in docker-compose.yml');
        console.log(`  2. LANGCHAIN_PROJECT=${PROJECT_NAME}`);
        console.log('  3. At least one post-call has been processed');
        return;
    }

    console.log(`Found ${runs.length} traces\n`);

    const stats: TraceStats = {
        totalRuns: runs.length,
        withSummary: 0,
        withHighlights: 0,
        withPersons: 0,
        withKGNodes: 0,
        withKGRelationships: 0,
        withErrors: 0,
        emptyNER: 0,
        emptyHighlights: 0,
        avgHighlightCount: 0,
        avgPersonCount: 0,
        avgTopicCount: 0,
    };

    let totalHighlights = 0;
    let totalPersons = 0;
    let totalTopics = 0;

    console.log('--- Per-Trace Analysis ---');
    for (const run of runs) {
        const runId = (run.id as string).slice(0, 8);
        const status = run.status || 'unknown';
        const error = run.error;
        const duration = run.end_time && run.start_time
            ? ((new Date(run.end_time).getTime() - new Date(run.start_time).getTime()) / 1000).toFixed(1)
            : '?';

        console.log(`\n  [${runId}...] status=${status} duration=${duration}s`);

        if (error) {
            stats.withErrors++;
            console.log(`    ERROR: ${typeof error === 'string' ? error.slice(0, 100) : JSON.stringify(error).slice(0, 100)}`);
        }

        // Fetch child runs for this trace
        const children: any[] = [];
        for await (const child of client.listRuns({
            traceId: run.trace_id,
            limit: 50,
        })) {
            children.push(child);
        }

        // Analyze each node
        for (const child of children) {
            const name = child.name || '';
            const outputs = child.outputs || {};

            if (name.includes('generate_summary') || name === 'generate_summary') {
                const summary = outputs.summary;
                if (summary) {
                    stats.withSummary++;
                    const topicCount = summary.topicsDiscussed?.length ?? 0;
                    const highlightCount = summary.keyHighlights?.length ?? 0;
                    totalTopics += topicCount;
                    totalHighlights += highlightCount;
                    console.log(`    summary: ${topicCount} topics, ${highlightCount} highlights, text=${(summary.summaryText?.length ?? 0)} chars`);
                    if (highlightCount === 0) stats.emptyHighlights++;
                }
            }

            if (name.includes('store_embeddings') || name === 'store_embeddings') {
                const entries = outputs.highlightEntries;
                if (entries?.length > 0) {
                    stats.withHighlights++;
                    console.log(`    embeddings: ${entries.length} stored`);
                }
            }

            if (name.includes('extract_persons') || name === 'extract_persons' || name === 'ner_extract_persons') {
                const persons = outputs.extractedPersons;
                if (persons) {
                    if (persons.length === 0) {
                        stats.emptyNER++;
                        console.log(`    NER: 0 persons (empty extraction)`);
                    } else {
                        stats.withPersons++;
                        totalPersons += persons.length;
                        console.log(`    NER: ${persons.length} persons — ${persons.map((p: any) => `"${p.name}" (${p.role || 'no role'})`).join(', ')}`);
                    }
                }
            }

            if (name === 'kg_populate_nodes' || name.includes('populate_kg_nodes')) {
                if (!child.error) stats.withKGNodes++;
            }

            if (name === 'kg_populate_relationships' || name.includes('populate_kg_relationships')) {
                if (!child.error) stats.withKGRelationships++;
            }
        }
    }

    // --- Aggregate stats ---
    stats.avgHighlightCount = stats.totalRuns > 0 ? totalHighlights / stats.totalRuns : 0;
    stats.avgPersonCount = stats.totalRuns > 0 ? totalPersons / stats.totalRuns : 0;
    stats.avgTopicCount = stats.totalRuns > 0 ? totalTopics / stats.totalRuns : 0;

    console.log('\n--- Aggregate Statistics ---');
    console.log(`Total traces: ${stats.totalRuns}`);
    console.log(`With errors: ${stats.withErrors} (${pct(stats.withErrors, stats.totalRuns)})`);
    console.log(`With summary: ${stats.withSummary} (${pct(stats.withSummary, stats.totalRuns)})`);
    console.log(`With highlights stored: ${stats.withHighlights} (${pct(stats.withHighlights, stats.totalRuns)})`);
    console.log(`With NER persons: ${stats.withPersons} (${pct(stats.withPersons, stats.totalRuns)})`);
    console.log(`Empty NER (0 persons): ${stats.emptyNER} (${pct(stats.emptyNER, stats.totalRuns)})`);
    console.log(`Empty highlights: ${stats.emptyHighlights} (${pct(stats.emptyHighlights, stats.totalRuns)})`);
    console.log(`With KG nodes: ${stats.withKGNodes} (${pct(stats.withKGNodes, stats.totalRuns)})`);
    console.log(`With KG relationships: ${stats.withKGRelationships} (${pct(stats.withKGRelationships, stats.totalRuns)})`);
    console.log(`\nAverages per run:`);
    console.log(`  Highlights: ${stats.avgHighlightCount.toFixed(1)}`);
    console.log(`  Persons: ${stats.avgPersonCount.toFixed(1)}`);
    console.log(`  Topics: ${stats.avgTopicCount.toFixed(1)}`);

    // --- Quality assessment ---
    console.log('\n--- Quality Assessment ---');
    const meaningfulRuns = stats.withSummary > 0 && stats.withHighlights > 0;
    const nerActive = stats.withPersons > 0 || stats.emptyNER > 0;
    const kgPopulating = stats.withKGNodes > 0;

    console.log(`Pipeline producing data: ${meaningfulRuns ? 'YES' : 'NO — summaries or highlights missing'}`);
    console.log(`NER active: ${nerActive ? 'YES' : 'NO — no NER traces found'}`);
    console.log(`KG population active: ${kgPopulating ? 'YES' : 'NO — no KG node traces found'}`);
    console.log(`Error rate: ${pct(stats.withErrors, stats.totalRuns)}`);
    console.log(`Empty NER rate: ${pct(stats.emptyNER, stats.totalRuns)}`);

    console.log('\n=== AUDIT COMPLETE ===');
}

function pct(n: number, total: number): string {
    if (total === 0) return 'N/A';
    return `${((n / total) * 100).toFixed(0)}%`;
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
