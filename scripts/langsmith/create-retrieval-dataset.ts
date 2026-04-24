/**
 * Creates a LangSmith dataset for evaluating the retrieveMemories RAG pipeline.
 *
 * Usage: npx tsx scripts/langsmith/create-retrieval-dataset.ts
 *
 * Prerequisites:
 * - LANGCHAIN_API_KEY set in .env or environment
 * - Database accessible (to look up a user with data)
 * - Qdrant accessible (to verify data exists)
 */
import 'dotenv/config';
import { Client } from 'langsmith';
import { PrismaClient } from '../../generated/prisma/index.js';

const DATASET_NAME = 'naiber-retrieval-eval';

interface DatasetExample {
    input: { query: string; userId: string };
    expectedOutput: {
        shouldReturnResults: boolean;
        expectedSources: Array<'qdrant' | 'neo4j' | 'both'>;
        minResultCount: number;
        description: string;
    };
}

async function findBestUserId(): Promise<{ userId: string; name: string; topicCount: number; summaryCount: number }> {
    const prisma = new PrismaClient();
    try {
        const profiles = await prisma.elderlyProfile.findMany({
            include: {
                _count: {
                    select: {
                        conversationTopics: true,
                        conversationSummaries: true,
                    },
                },
            },
        });

        const ranked = profiles
            .map(p => ({
                userId: p.id,
                name: p.name,
                topicCount: p._count.conversationTopics,
                summaryCount: p._count.conversationSummaries,
                score: p._count.conversationTopics + p._count.conversationSummaries,
            }))
            .sort((a, b) => b.score - a.score);

        if (ranked.length === 0) {
            throw new Error('No elderly profiles found in database');
        }

        const best = ranked[0];
        console.log(`Best user for evaluation: "${best.name}" (${best.userId})`);
        console.log(`  Topics: ${best.topicCount}, Summaries: ${best.summaryCount}`);
        console.log(`  Runner-ups: ${ranked.slice(1, 4).map(r => `"${r.name}" (topics=${r.topicCount}, summaries=${r.summaryCount})`).join(', ')}`);

        return best;
    } finally {
        await prisma.$disconnect();
    }
}

async function getTopicsForUser(userId: string): Promise<string[]> {
    const prisma = new PrismaClient();
    try {
        const topics = await prisma.conversationTopic.findMany({
            where: { elderlyProfileId: userId },
            select: { topicName: true },
        });
        return topics.map(t => t.topicName);
    } finally {
        await prisma.$disconnect();
    }
}

function buildExamples(userId: string, topics: string[]): DatasetExample[] {
    const examples: DatasetExample[] = [];

    // 1. Direct topic match queries — use actual topics from the user's data
    if (topics.length > 0) {
        examples.push({
            input: { query: `Tell me about ${topics[0]}`, userId },
            expectedOutput: {
                shouldReturnResults: true,
                expectedSources: ['qdrant', 'both'],
                minResultCount: 1,
                description: `Direct match on known topic: "${topics[0]}"`,
            },
        });
    }

    if (topics.length > 1) {
        examples.push({
            input: { query: `What do you remember about ${topics[1]}?`, userId },
            expectedOutput: {
                shouldReturnResults: true,
                expectedSources: ['qdrant', 'both'],
                minResultCount: 1,
                description: `Direct match on known topic: "${topics[1]}"`,
            },
        });
    }

    // 2. Multi-topic query
    if (topics.length >= 2) {
        examples.push({
            input: { query: `${topics[0]} and ${topics[1]}`, userId },
            expectedOutput: {
                shouldReturnResults: true,
                expectedSources: ['qdrant', 'both', 'neo4j'],
                minResultCount: 1,
                description: 'Multi-topic query — tests breadth of retrieval',
            },
        });
    }

    // 3. Vague/emotional queries — should still surface relevant memories
    examples.push({
        input: { query: "I've been feeling lonely lately", userId },
        expectedOutput: {
            shouldReturnResults: true,
            expectedSources: ['qdrant', 'both'],
            minResultCount: 0,
            description: 'Emotional/vague query — tests sentiment-adjacent retrieval',
        },
    });

    examples.push({
        input: { query: "What have we talked about before?", userId },
        expectedOutput: {
            shouldReturnResults: true,
            expectedSources: ['qdrant', 'both'],
            minResultCount: 1,
            description: 'Broad recall query — should return diverse results',
        },
    });

    // 4. Person reference queries
    examples.push({
        input: { query: "Do you remember any people I've mentioned?", userId },
        expectedOutput: {
            shouldReturnResults: true,
            expectedSources: ['qdrant', 'both', 'neo4j'],
            minResultCount: 0,
            description: 'Person recall — tests KG person retrieval',
        },
    });

    // 5. Novel topic (should return empty or low relevance)
    examples.push({
        input: { query: "quantum computing breakthroughs", userId },
        expectedOutput: {
            shouldReturnResults: false,
            expectedSources: [],
            minResultCount: 0,
            description: 'Novel topic — unlikely to match any stored memories',
        },
    });

    examples.push({
        input: { query: "cryptocurrency market analysis", userId },
        expectedOutput: {
            shouldReturnResults: false,
            expectedSources: [],
            minResultCount: 0,
            description: 'Novel topic — unlikely to match elderly user memories',
        },
    });

    // 6. Health-adjacent (general calls may mention health topics)
    examples.push({
        input: { query: "How have I been feeling health-wise?", userId },
        expectedOutput: {
            shouldReturnResults: true,
            expectedSources: ['qdrant', 'both'],
            minResultCount: 0,
            description: 'Health-adjacent general query — may or may not have matches',
        },
    });

    // 7. Recency query
    examples.push({
        input: { query: "What did we talk about last time?", userId },
        expectedOutput: {
            shouldReturnResults: true,
            expectedSources: ['qdrant', 'both'],
            minResultCount: 1,
            description: 'Recency query — tests if recent conversations surface first',
        },
    });

    return examples;
}

async function main() {
    const apiKey = process.env.LANGCHAIN_API_KEY;
    if (!apiKey) {
        console.error('LANGCHAIN_API_KEY not set');
        process.exit(1);
    }

    const client = new Client({ apiKey });

    // Find best user for evaluation
    const { userId, name } = await findBestUserId();
    const topics = await getTopicsForUser(userId);
    console.log(`\nUser topics (${topics.length}): ${topics.join(', ')}\n`);

    // Build examples
    const examples = buildExamples(userId, topics);
    console.log(`Built ${examples.length} evaluation examples\n`);

    // Create or update dataset
    let dataset;
    try {
        dataset = await client.readDataset({ datasetName: DATASET_NAME });
        console.log(`Dataset "${DATASET_NAME}" already exists (${dataset.id}), will add/update examples`);
    } catch {
        dataset = await client.createDataset(DATASET_NAME, {
            description: `Retrieval evaluation dataset for nAIber RAG pipeline. Target user: "${name}" (${userId}). Created ${new Date().toISOString()}.`,
        });
        console.log(`Created dataset "${DATASET_NAME}" (${dataset.id})`);
    }

    // Upload examples
    for (const example of examples) {
        await client.createExample(
            example.input,
            example.expectedOutput,
            { datasetId: dataset.id }
        );
        console.log(`  Added: ${example.expectedOutput.description}`);
    }

    console.log(`\nDone. ${examples.length} examples uploaded to "${DATASET_NAME}".`);
    console.log(`View at: https://smith.langchain.com/datasets`);
}

main().catch(err => {
    console.error('Failed:', err);
    process.exit(1);
});