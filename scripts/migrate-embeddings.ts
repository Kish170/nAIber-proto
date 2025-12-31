import { PrismaClient } from '@prisma/client';
import { QdrantClient, OpenAIClient, RedisClient, EmbeddingService, TextPreprocessor } from '@naiber/shared';
import 'dotenv/config';

async function migrateEmbeddings() {
    const prisma = new PrismaClient();
    const openAIClient = new OpenAIClient({
        apiKey: process.env.OPENAI_API_KEY!,
        baseUrl: process.env.OPENAI_BASE_URL
    });
    const redisClient = RedisClient.getInstance();
    await redisClient.connect();

    const textPreprocessor = new TextPreprocessor();
    const embeddingService = new EmbeddingService(openAIClient, redisClient, textPreprocessor);

    const qdrantClient = new QdrantClient({
        baseUrl: process.env.QDRANT_URL!,
        apiKey: process.env.QDRANT_API_KEY!,
        collectionName: process.env.QDRANT_COLLECTION!
    });

    console.log('=== Starting Embedding Migration ===\n');

    // STEP 1: Migrate ConversationTopics in PostgreSQL
    console.log('Step 1: Migrating ConversationTopics...');
    const topics = await prisma.conversationTopic.findMany({
        select: { id: true, topicName: true }
    });

    console.log(`Found ${topics.length} topics to re-embed`);

    for (let i = 0; i < topics.length; i++) {
        const topic = topics[i];
        try {
            const result = await embeddingService.generateEmbedding(topic.topicName);

            await prisma.conversationTopic.update({
                where: { id: topic.id },
                data: { topicEmbedding: result.embedding }
            });

            console.log(`  [${i+1}/${topics.length}] ${topic.topicName} → ${result.preprocessedText}`);
        } catch (error: any) {
            console.error(`  ERROR with topic ${topic.id}:`, error.message);
        }
    }

    // STEP 2: Migrate highlights in Qdrant
    console.log('\nStep 2: Migrating Qdrant highlights...');
    const summaries = await prisma.conversationSummary.findMany({
        select: {
            id: true,
            userId: true,
            conversationId: true,
            keyHighlights: true
        },
        where: {
            keyHighlights: { not: null }
        }
    });

    console.log(`Found ${summaries.length} conversation summaries with highlights`);

    for (const summary of summaries) {
        const highlights = summary.keyHighlights as string[];
        if (!Array.isArray(highlights) || highlights.length === 0) continue;

        try {
            const results = await embeddingService.generateEmbeddings(highlights);

            const points = highlights.map((highlight, i) => ({
                id: `${summary.conversationId}-highlight-${i}`,
                vector: results[i].embedding,
                payload: {
                    userId: summary.userId,
                    conversationId: summary.conversationId,
                    highlight: highlight
                }
            }));

            await qdrantClient.postToCollection(points);
            console.log(`  Updated ${highlights.length} highlights for conversation ${summary.conversationId}`);
        } catch (error: any) {
            console.error(`  ERROR with summary ${summary.id}:`, error.message);
        }
    }

    console.log('\n=== Migration Complete ===');
    await prisma.$disconnect();
    await redisClient.disconnect();
}

migrateEmbeddings().catch(console.error);
