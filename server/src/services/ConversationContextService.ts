export class ConversationMemoryService {
	private collectionName: string;
	
	constructor() {
		this.collectionName = 'naiber-conversations';
	}
	
	private getQdrantHeaders() {
		return {
			'Content-Type': 'application/json',
			'api-key': process.env.QDRANT_API_KEY || ''
		};
	}

	private async qdrantFetch(endpoint: string, options: RequestInit = {}) {
		console.log('[Qdrant] Environment variables:', {
			hasUrl: !!process.env.QDRANT_URL,
			urlValue: process.env.QDRANT_URL,
			hasApiKey: !!process.env.QDRANT_API_KEY,
			apiKeyLength: process.env.QDRANT_API_KEY?.length || 0
		});

		const url = `${process.env.QDRANT_URL}${endpoint}`;
		console.log(`[Qdrant] Making fetch request to: ${url}`);
		
		const response = await fetch(url, {
			...options,
			headers: {
				...this.getQdrantHeaders(),
				...options.headers
			}
		});

		console.log(`[Qdrant] Response status: ${response.status}`);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[Qdrant] API error: ${response.status} ${errorText}`);
			throw new Error(`Qdrant API error: ${response.status} ${errorText}`);
		}

		return response.json();
	}

	private async generateEmbedding(text: String): Promise<number[]> {
		try {
			console.log('[OpenAI] Generating embedding for text length:', text.length);
			console.log('[OpenAI] Has OPENAI_API_KEY:', !!process.env.OPENAI_API_KEY);

			const response = await fetch(
				"https://api.openai.com/v1/embeddings",
				{
					headers: {
						Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
						"Content-Type": "application/json",
					},
					method: "POST",
					body: JSON.stringify({
						input: text,
						model: "text-embedding-3-small"
					}),
				}
			);

			console.log('[OpenAI] Response status:', response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error('[OpenAI] API error:', response.status, errorText);
				throw new Error(`OpenAI API error: ${response.status}`);
			}

			const result = await response.json();
			const embedding = result.data[0].embedding;
			console.log('[OpenAI] ✅ Embedding generated successfully, vector length:', embedding.length);
			return embedding;
		} catch (error) {
			console.error('[OpenAI] ❌ Failed to generate embedding:', error);
			throw new Error('Vector embedding generation failed');
		}
	}

	async initializeCollection() {
		try {
			console.log(`[Qdrant] Attempting to create collection: ${this.collectionName}`);

			console.log('[Qdrant] Calling createCollection...');
			await this.qdrantFetch(`/collections/${this.collectionName}`, {
				method: 'PUT',
				body: JSON.stringify({
					vectors: {
						size: 1536,
						distance: 'Cosine'
					}
				})
			});
			console.log(`[Qdrant] ✅ Collection '${this.collectionName}' created successfully`);
		} catch (error: any) {
			console.log('[Qdrant] Collection creation error:', {
				message: error.message,
				includesAlreadyExists: error.message?.includes('already exists')
			});

			if (!error.message.includes('already exists')) {
				console.error(`[Qdrant] ❌ Failed to create collection '${this.collectionName}':`, error);
				throw error;
			} else {
				console.log(`[Qdrant] ℹ️ Collection '${this.collectionName}' already exists, continuing...`);
			}
		}

		// Create index for userId field to enable filtering
		try {
			console.log('[Qdrant] Creating index for userId field...');
			await this.qdrantFetch(`/collections/${this.collectionName}/index`, {
				method: 'PUT',
				body: JSON.stringify({
					field_name: 'userId',
					field_schema: 'keyword'
				})
			});
			console.log('[Qdrant] ✅ Index for userId created successfully');
		} catch (indexError: any) {
			if (indexError.message.includes('already exists')) {
				console.log('[Qdrant] ℹ️ Index for userId already exists');
			} else {
				console.error('[Qdrant] ❌ Failed to create userId index:', indexError);
				// Don't throw here - the collection can still work for basic operations
			}
		}
	}

	async saveConversationHighlights(userId: String, conversationId: String, conversationSummary: any) {
		const conversation = typeof conversationSummary === "string"? JSON.parse(conversationSummary): conversationSummary;
		
		const points = [];
		
		for (let i = 0; i < conversation.highlights.length; i++) {
			const highlight = conversation.highlights[i];
			const embedding = await this.generateEmbedding(highlight);
			
			points.push({
				id: Date.now() + i,
				vector: embedding,
				payload: {
					userId,
					conversationId: conversationId,
					highlight: highlight,
					topics: conversation.topics.join(', '),
					mood: conversation.mood || 'neutral',
					conversationDate: new Date().toISOString(),
					timestamp: Date.now(),
					highlightIndex: i
				}
			});
		}
		
		await this.qdrantFetch(`/collections/${this.collectionName}/points`, {
			method: 'PUT',
			body: JSON.stringify({ points })
		});
		
		return { success: true, conversationId, highlightsStored: points.length };
	}

	async searchConversationHistory(userId: String, query: String, limit?: number ) {
		const queryEmbedding = await this.generateEmbedding(query);

		const searchResults = await this.qdrantFetch(`/collections/${this.collectionName}/points/search`, {
			method: 'POST',
			body: JSON.stringify({
				vector: queryEmbedding,
				filter: {
					must: [{ key: 'userId', match: { value: userId } }]
				},
				limit: limit || 10,
				with_payload: true
			})
		});

		return {
			success: true,
			conversations: searchResults.result.map((result: any) => {
				const payload = result.payload ?? {};
				return {
					highlights: payload.highlight ?? '',
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

	async getTranscriptWithRetry(conversationId: string, retries = 5, delayMs = 1000) {
		for (let i = 0; i < retries; i++) {
			const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
			headers: {
				'xi-api-key': process.env.ELEVENLABS_API_KEY!,
				'Content-Type': 'application/json',
			},
			});

			const data = await res.json();
			if (data.transcript && data.transcript.length > 0) {
			return data.transcript.map((turn: { message: any; role: string; }) => {
					if (!turn.message) return null;
					return `${turn.role.toUpperCase()}: ${turn.message}`;
				})
				.filter(Boolean) // remove nulls
				.join("\n");
			}
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}

		return []; 
	}

}