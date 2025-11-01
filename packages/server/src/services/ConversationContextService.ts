import { prismaClient } from '@naiber/shared';

export class ConversationMemoryService {
	private collectionName: string;

	constructor() {
		this.collectionName = 'naiber-conversations';
	}

    // comment out only uncomment if you believe there is an issue here
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
			console.log(`[Qdrant]  Collection '${this.collectionName}' created successfully`);
		} catch (error: any) {
			console.log('[Qdrant] Collection creation error:', {
				message: error.message,
				includesAlreadyExists: error.message?.includes('already exists')
			});

			if (!error.message.includes('already exists')) {
				console.error(`[Qdrant]  Failed to create collection '${this.collectionName}':`, error);
				throw error;
			} else {
				console.log(`[Qdrant] ℹ️ Collection '${this.collectionName}' already exists, continuing...`);
			}
		}

		try {
			console.log('[Qdrant] Creating index for userId field...');
			await this.qdrantFetch(`/collections/${this.collectionName}/index`, {
				method: 'PUT',
				body: JSON.stringify({
					field_name: 'userId',
					field_schema: 'keyword'
				})
			});
			console.log('[Qdrant]  Index for userId created successfully');
		} catch (indexError: any) {
			if (indexError.message.includes('already exists')) {
				console.log('[Qdrant] ℹ️ Index for userId already exists');
			} else {
				console.error('[Qdrant]  Failed to create userId index:', indexError);
			}
		}
	}

	async generateAndSaveConversationSummary(userId: string, conversationId: string) {
		try {
			console.log(`[Summary] Starting summary generation for conversation ${conversationId}`);

			const transcript = await this.getTranscriptWithRetry(conversationId);
			if (!transcript || transcript.length === 0) {
				console.error('[Summary]  No transcript available');
				throw new Error('No transcript available for conversation');
			}

			console.log('[Summary]  Transcript retrieved');

			const summary = await this.generateConversationSummary(transcript);

			console.log('[Summary] Saving to PostgreSQL...');
			const conversationSummary = await prismaClient.conversationSummary.create({
				data: {
					userId: userId,
					conversationId: conversationId,
					summaryText: summary.summaryText,
					topicsDiscussed: summary.topicsDiscussed,
					keyHighlights: summary.keyHighlights
				}
			});

			console.log('[Summary]  Saved to PostgreSQL');

			if (summary.keyHighlights && summary.keyHighlights.highlights) {
				console.log('[Summary] Saving highlights to Qdrant...');
				await this.saveConversationHighlights(userId, conversationId, summary.keyHighlights);
				console.log('[Summary]  Highlights saved to Qdrant');
			}

			return {
				success: true,
				conversationId,
				summaryId: conversationSummary.id,
				topicsCount: summary.topicsDiscussed.length,
				highlightsCount: summary.keyHighlights.highlights?.length || 0
			};

		} catch (error) {
			console.error('[Summary]  Failed to generate and save conversation summary:', error);
			throw error;
		}
	}

	/**
	 * Saves conversation highlights to Qdrant vector DB for RAG
	 */
	async saveConversationHighlights(userId: String, conversationId: String, conversationSummary: any) {
		const conversation = typeof conversationSummary === "string" ? JSON.parse(conversationSummary) : conversationSummary;

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

	// ============================================
	// QUERY OPERATIONS (During conversation)
	// ============================================

	/**
	 * Searches conversation history using semantic search
	 */
	async searchConversationHistory(userId: String, query: String, limit?: number) {
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

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	/**
	 * Gets transcript from ElevenLabs with retry logic
	 */
	private async getTranscriptWithRetry(conversationId: string, retries = 5, delayMs = 1000) {
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

	/**
	 * Generates a conversation summary using OpenAI
	 */
	private async generateConversationSummary(transcript: string) {
		try {
			console.log('[OpenAI] Generating conversation summary for transcript length:', transcript.length);

			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				headers: {
					'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
					'Content-Type': 'application/json',
				},
				method: 'POST',
				body: JSON.stringify({
					model: 'gpt-4o-mini',
					messages: [
						{
							role: 'system',
							content: `You are analyzing a conversation between nAIber (an AI companion) and an elderly user.

Your task is to create a structured summary that will be used in the next conversation.

Return a JSON object with this exact structure:
{
  "summaryText": "A 2-3 sentence summary of the conversation covering main topics and user's mood/state",
  "topicsDiscussed": ["topic1", "topic2", "topic3"],
  "keyHighlights": {
    "highlights": ["notable thing user mentioned 1", "notable thing user mentioned 2"],
    "topics": ["topic1", "topic2"],
    "mood": "positive|neutral|down|concerned"
  }
}

Guidelines:
- Focus on what the USER said, not what nAIber said
- Capture topics the user seemed engaged with
- Note any important life updates, health mentions, or emotional moments
- Keep it concise but meaningful
- Mood should reflect overall emotional tone`
						},
						{
							role: 'user',
							content: `Conversation transcript:\n\n${transcript}`
						}
					],
					response_format: { type: 'json_object' },
					temperature: 0.3
				}),
			});

			console.log('[OpenAI] Response status:', response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error('[OpenAI] API error:', response.status, errorText);
				throw new Error(`OpenAI API error: ${response.status}`);
			}

			const result = await response.json();
			const summary = JSON.parse(result.choices[0].message.content);
			console.log('[OpenAI]  Conversation summary generated successfully');
			return summary;
		} catch (error) {
			console.error('[OpenAI]  Failed to generate conversation summary:', error);
			throw new Error('Conversation summary generation failed');
		}
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
			console.log('[OpenAI]  Embedding generated successfully, vector length:', embedding.length);
			return embedding;
		} catch (error) {
			console.error('[OpenAI]  Failed to generate embedding:', error);
			throw new Error('Vector embedding generation failed');
		}
	}

}
