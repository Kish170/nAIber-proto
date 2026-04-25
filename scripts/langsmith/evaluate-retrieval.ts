/**
 * Evaluates the retrieveMemories RAG pipeline against the LangSmith dataset.
 *
 * Usage: npx tsx scripts/langsmith/evaluate-retrieval.ts
 *
 * Prerequisites:
 * - LANGCHAIN_API_KEY set in .env or environment
 * - OPENAI_API_KEY set (for LLM-as-judge relevance scoring)
 * - Dataset created via create-retrieval-dataset.ts
 * - Docker services running (Qdrant, Neo4j, Postgres, Redis)
 */
import 'dotenv/config';
import { Client } from 'langsmith';
import { evaluate, type EvaluateOptions, type EvaluatorT } from 'langsmith/evaluation';
import { OpenAIClient } from '@naiber/shared-clients';

const DATASET_NAME = 'naiber-retrieval-eval';

type RetrievalInput = { query: string; userId: string };
type RetrievalSource = 'qdrant' | 'kg_discovery' | 'both';
type RetrievalOutput = {
    highlights: Array<{
        text: string;
        topic: string;
        similarity: number;
        source: RetrievalSource;
    }>;
    relatedTopics: Array<{ name: string; mentionCount: number }>;
    persons: Array<{ name: string; relationship: string }>;
};
type ReferenceOutput = {
    shouldReturnResults: boolean;
    expectedSources: Array<'qdrant' | 'neo4j' | 'both'>;
    minResultCount: number;
    description: string;
};
type LangsmithEvaluatorArgs = {
    run: unknown;
    example: unknown;
    inputs: Record<string, any>;
    outputs: Record<string, any>;
    referenceOutputs?: Record<string, any>;
    attachments?: Record<string, any>;
};

// Import the actual handler — this runs against live Qdrant/Neo4j
async function loadHandler() {
    const { retrieveMemoriesHandler } = await import('../../apps/mcp-server/src/mcp/tools/retrieveMemories.js');
    return retrieveMemoriesHandler;
}

// --- Target function ---
const target = async (input: RetrievalInput): Promise<RetrievalOutput> => {
    const handler = await loadHandler();
    return handler(input);
};

function getEvalData(args: LangsmithEvaluatorArgs): {
    input: RetrievalInput;
    output?: RetrievalOutput;
    referenceOutput?: ReferenceOutput;
} {
    return {
        input: args.inputs as RetrievalInput,
        output: args.outputs as RetrievalOutput | undefined,
        referenceOutput: args.referenceOutputs as ReferenceOutput | undefined,
    };
}

// --- Evaluators ---

/**
 * Relevance: LLM-as-judge scores each highlight for relevance to the query.
 */
const relevanceEvaluator: EvaluatorT = async (args: LangsmithEvaluatorArgs) => {
    const { input, output, referenceOutput } = getEvalData(args);
    const highlights = output?.highlights ?? [];

    if (highlights.length === 0) {
        return {
            key: 'relevance',
            score: referenceOutput?.shouldReturnResults ? 0 : 1,
            comment: referenceOutput?.shouldReturnResults
                ? 'No results returned when results were expected'
                : 'Correctly returned no results for novel query',
        };
    }

    const openai = OpenAIClient.getInstance({
        apiKey: process.env.OPENAI_API_KEY!,
        baseUrl: process.env.OPENAI_BASE_URL,
    });

    const highlightTexts = highlights.map((h: { text: string; similarity: number }, i: number) =>
        `[${i + 1}] (score: ${h.similarity?.toFixed(3)}) ${h.text}`
    ).join('\n');

    const response = await openai.generalGPTCall({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are evaluating whether retrieved memories are relevant to a user's query.
Score each result 0-1 for relevance, then give an overall score.
Return JSON: { "overallScore": 0.0-1.0, "reasoning": "...", "perResult": [{ "index": 1, "score": 0.0-1.0, "relevant": true/false }] }`,
            },
            {
                role: 'user',
                content: `Query: "${input.query}"\n\nRetrieved memories:\n${highlightTexts}`,
            },
        ],
        response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) return { key: 'relevance', score: 0, comment: 'LLM judge returned empty response' };

    let parsed: { overallScore?: number; reasoning?: string };
    try {
        parsed = JSON.parse(content) as { overallScore?: number; reasoning?: string };
    } catch (error) {
        return {
            key: 'relevance',
            score: 0,
            comment: `Failed to parse LLM judge response: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
    }

    return {
        key: 'relevance',
        score: parsed.overallScore ?? 0,
        comment: parsed.reasoning ?? '',
    };
};

/**
 * Source diversity: checks if results come from multiple sources (qdrant, kg, both).
 */
const sourceDiversityEvaluator: EvaluatorT = (args: LangsmithEvaluatorArgs) => {
    const { output, referenceOutput } = getEvalData(args);
    const highlights = output?.highlights ?? [];
    if (highlights.length === 0) {
        return {
            key: 'source_diversity',
            score: referenceOutput?.shouldReturnResults === false ? 1 : 0,
            comment: referenceOutput?.shouldReturnResults === false
                ? 'No results returned, which matches expectations'
                : 'No results to evaluate sources',
        };
    }

    const sources = new Set(highlights.map(h => h.source).filter(Boolean));
    const hasQdrant = sources.has('qdrant') || sources.has('both');
    const hasKG = sources.has('kg_discovery') || sources.has('both');
    const expectedSources = new Set(referenceOutput?.expectedSources ?? []);

    let score = 0;
    let comment = '';
    if (expectedSources.size === 0) {
        score = 0.2;
        comment = `Results returned from unexpected sources: ${Array.from(sources).join(', ')}`;
    } else if (hasQdrant && hasKG) {
        score = 1.0;
        comment = `Both sources present: ${Array.from(sources).join(', ')}`;
    } else if (hasQdrant) {
        score = expectedSources.has('qdrant') ? 0.75 : 0.5;
        comment = expectedSources.has('qdrant')
            ? 'Only Qdrant results, which matches expected source coverage'
            : 'Only Qdrant results — KG not contributing';
    } else if (hasKG) {
        score = expectedSources.has('neo4j') ? 0.75 : 0.5;
        comment = expectedSources.has('neo4j')
            ? 'Only KG results, which matches expected source coverage'
            : 'Only KG results — Qdrant not contributing';
    } else {
        score = 0;
        comment = `Unknown sources: ${Array.from(sources).join(', ')}`;
    }

    return { key: 'source_diversity', score, comment };
};

/**
 * Empty result detection: flags when results expected but none returned.
 */
const emptyResultEvaluator: EvaluatorT = (args: LangsmithEvaluatorArgs) => {
    const { output, referenceOutput } = getEvalData(args);
    const highlights = output?.highlights ?? [];
    const expected = referenceOutput?.shouldReturnResults ?? true;
    const minCount = referenceOutput?.minResultCount ?? 0;

    if (expected && highlights.length === 0) {
        return { key: 'empty_detection', score: 0, comment: 'Expected results but got none' };
    }
    if (!expected && highlights.length > 0) {
        return { key: 'empty_detection', score: 0.3, comment: `Got ${highlights.length} results for a query expected to return empty` };
    }
    if (expected && highlights.length < minCount) {
        return { key: 'empty_detection', score: 0.5, comment: `Got ${highlights.length} results, expected at least ${minCount}` };
    }
    return { key: 'empty_detection', score: 1.0, comment: `Result count (${highlights.length}) matches expectations` };
};

/**
 * Score distribution: checks if similarity scores are spread or clustered near threshold.
 */
const scoreDistributionEvaluator: EvaluatorT = (args: LangsmithEvaluatorArgs) => {
    const { output } = getEvalData(args);
    const highlights = output?.highlights ?? [];
    if (highlights.length < 2) {
        return { key: 'score_distribution', score: 0.5, comment: 'Not enough results for distribution analysis' };
    }

    const scores = highlights
        .map(h => h.similarity)
        .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
    if (scores.length < 2) {
        return { key: 'score_distribution', score: 0.5, comment: 'Not enough numeric similarity scores for distribution analysis' };
    }

    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const spread = maxScore - minScore;
    const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;

    // Good distribution: spread > 0.1 and average > 0.5
    let score = 0;
    if (avgScore > 0.6 && spread > 0.1) score = 1.0;
    else if (avgScore > 0.5) score = 0.7;
    else if (avgScore > 0.4) score = 0.4;
    else score = 0.2;

    return {
        key: 'score_distribution',
        score,
        comment: `avg=${avgScore.toFixed(3)} min=${minScore.toFixed(3)} max=${maxScore.toFixed(3)} spread=${spread.toFixed(3)}`,
    };
};

/**
 * KG contribution: for results from KG, what was the kgScore contribution?
 */
const kgContributionEvaluator: EvaluatorT = (args: LangsmithEvaluatorArgs) => {
    const { output } = getEvalData(args);
    const persons = output?.persons ?? [];
    const relatedTopics = output?.relatedTopics ?? [];
    const highlights = output?.highlights ?? [];

    const kgResults = highlights.filter(h =>
        h.source === 'kg_discovery' || h.source === 'both'
    );

    const hasPersons = persons.length > 0;
    const hasRelatedTopics = relatedTopics.length > 0;
    const hasKGHighlights = kgResults.length > 0;

    let score = 0;
    const contributions: string[] = [];

    if (hasPersons) { score += 0.33; contributions.push(`${persons.length} persons`); }
    if (hasRelatedTopics) { score += 0.33; contributions.push(`${relatedTopics.length} related topics`); }
    if (hasKGHighlights) { score += 0.34; contributions.push(`${kgResults.length} KG highlights`); }

    return {
        key: 'kg_contribution',
        score,
        comment: contributions.length > 0
            ? `KG contributed: ${contributions.join(', ')}`
            : 'KG contributed nothing — all results from vector search only',
    };
};

async function main() {
    const apiKey = process.env.LANGCHAIN_API_KEY;
    if (!apiKey) {
        console.error('LANGCHAIN_API_KEY not set');
        process.exit(1);
    }

    const client = new Client({ apiKey });

    console.log(`Running evaluation against dataset "${DATASET_NAME}"...\n`);

    const options: EvaluateOptions = {
        client,
        data: DATASET_NAME,
        evaluators: [
            relevanceEvaluator,
            sourceDiversityEvaluator,
            emptyResultEvaluator,
            scoreDistributionEvaluator,
            kgContributionEvaluator,
        ],
        experimentPrefix: 'naiber-retrieval-audit',
        maxConcurrency: 1,
    };

    await evaluate(target, options);

    console.log('\nEvaluation complete. View results at: https://smith.langchain.com/');
}

main().catch(err => {
    console.error('Failed:', err);
    process.exit(1);
});
