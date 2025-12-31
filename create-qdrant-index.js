import 'dotenv/config';
import axios from 'axios';

async function createUserIdIndex() {
    const baseURL = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;
    const collectionName = process.env.QDRANT_COLLECTION;

    const client = axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        }
    });

    try {
        console.log('Creating index on userId field...');
        console.log('Collection:', collectionName);

        const response = await client.put(`/collections/${collectionName}/index`, {
            field_name: "userId",
            field_schema: "keyword"
        });

        console.log('✓ Index created successfully!');
        console.log('Response:', response.data);

    } catch (error) {
        if (error.response?.status === 400 && error.response?.data?.status?.error?.includes('already exists')) {
            console.log('✓ Index already exists - no action needed');
        } else {
            console.error('✗ Error creating index:', error.message);
            if (error.response?.data) {
                console.error('Details:', JSON.stringify(error.response.data, null, 2));
            }
        }
    }
}

createUserIdIndex();
