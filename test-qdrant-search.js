import 'dotenv/config';
import { QdrantClient, OpenAIClient } from './packages/shared/dist/index.js';

async function testQdrantSearch() {
    console.log('=== Testing Qdrant Search ===\n');

    // Initialize clients
    const qdrantClient = new QdrantClient({
        baseUrl: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: process.env.QDRANT_COLLECTION
    });

    const openAIClient = new OpenAIClient({
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL
    });

    try {
        // Generate a test embedding
        console.log('1. Generating test embedding...');
        const testText = "talking about books";
        const embedding = await openAIClient.generateEmbeddings(testText);
        console.log('   ✓ Embedding generated, length:', embedding.length);

        // Try to search
        console.log('\n2. Searching Qdrant collection...');
        console.log('   Collection:', process.env.QDRANT_COLLECTION);
        console.log('   User ID:', 'e84a6ea3-f325-412f-80e4-ed525b9ef824');

        const results = await qdrantClient.searchCollection({
            userId: 'e84a6ea3-f325-412f-80e4-ed525b9ef824',
            queryEmbedding: embedding,
            limit: 5
        });

        console.log('\n3. Search Results:');
        console.log('   Found', results.length, 'results');

        if (results.length > 0) {
            console.log('\n   Results:');
            results.forEach((result, i) => {
                console.log(`   ${i + 1}. Highlight: ${result.highlight}`);
                console.log(`      Similarity: ${result.similarity}`);
            });
        } else {
            console.log('   No results found (this might be expected if collection is empty)');
        }

        console.log('\n✓ Test completed successfully!');

    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        if (error.response?.data) {
            console.error('\nQdrant error details:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }
    }
}

testQdrantSearch();
