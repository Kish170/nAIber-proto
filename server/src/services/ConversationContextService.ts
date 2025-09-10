export class ConversationMemoryService {
    private client: any;
    private collectionName: string;
    
    constructor() {
        this.collectionName = 'naiber-conversations';
    }
    
    private async getQdrantClient() {
        if (!this.client) {
            const { QdrantClient } = await import('@qdrant/js-client-rest');
            this.client = new QdrantClient({
                url: process.env.QDRANT_URL, 
                apiKey: process.env.QDRANT_API_KEY,
            });
        }
        return this.client;
    }

    private async generateEmbedding(text: String): Promise<number[]> {
        try {
            const response = await fetch(
                "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-mpnet-base-v2",
                {
                    headers: {
                        Authorization: `Bearer ${process.env.HF_TOKEN}`,
                        "Content-Type": "application/json",
                    },
                    method: "POST",
                    body: JSON.stringify({ inputs: text }),
                }
            );
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Failed to generate embedding:', error);
            throw new Error('Vector embedding generation failed');
        }
    }

    async initializeCollection() {
        try {
            const client = await this.getQdrantClient();
            await client.createCollection(this.collectionName, {
                vectors: {
                    size: 768,
                    distance: 'Cosine'
                }
            });
        } catch (error: any) {
            if (!error.message.includes('already exists')) {
                throw error;
            }
        }
    }

    async saveConversationHighlights(userId: String, conversationId: String, conversationSummary: any) {
        const conversation = typeof conversationSummary === "string"? JSON.parse(conversationSummary): conversationSummary;
        const embedding = await this.generateEmbedding(conversation.highlights);
        
        const client = await this.getQdrantClient();
        await client.upsert(this.collectionName, {
            points: [{
                id: conversationId, // Can get conversation ID from ElevenLabs later
                vector: embedding,
                payload: {
                    userId,
                    highlights: conversation.highlights,
                    topics: conversation.topics.join(', '),
                    mood: conversation.mood || 'neutral',
                    conversationDate: new Date().toISOString(),
                    timestamp: Date.now()
                }
            }]
        });

        return { success: true, conversationId };
    }

    async searchConversationHistory(userId: String, query: String, limit?: number ) {
        const queryEmbedding = await this.generateEmbedding(query);

        const client = await this.getQdrantClient();
        const results = await client.search(this.collectionName, {
            vector: queryEmbedding,
            filter: {
                must: [{ key: 'userId', match: { value: userId } }]
            },
            limit,
            with_payload: true
        });

        return {
            success: true,
            conversations: results.map((result: any) => {
                const payload = result.payload ?? {};
                return {
                    highlights: payload.highlights ?? '',
                    topics: Array.isArray(payload.topics)
                        ? payload.topics
                        : (typeof payload.topics === 'string' ? payload.topics.split(', ') : []),
                    mood: payload.mood ?? '',
                    date: payload.conversationDate ?? '',
                    similarity: result.score
                };
            })
        };
    }

    async getTranscript(conversationId: String) {
        const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
            headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY!,
            'Content-Type': 'application/json',
            },
        });

        if (!res.ok) {
            throw new Error(`Failed to fetch transcript: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return data.transcript; // array of messages
    }
}