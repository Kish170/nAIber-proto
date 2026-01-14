import { ElevenLabsClient, OpenAIClient, QdrantClient, RedisClient, EmbeddingService, TextPreprocessor, createSummary, Message, TranscriptMessage, UserProfileData, createConversationTopic, getConversationTopics, createConversationReferences, ReturnedTopic, updateConversationTopic, ConversationPoint } from '@naiber/shared';
import cosine from 'compute-cosine-similarity';
import { randomUUID } from 'crypto';

export interface SummaryRef {
    conversationId: string;
	summaryId: string;
	topicsDiscussed: string[];
	keyHighlights: string[];
}


export class PostCallFlow {
    private elevenLabsClient: ElevenLabsClient;
    private openAIClient: OpenAIClient;
    private qdrantClient: QdrantClient;
    private redisClient: RedisClient;
    private textPreprocessor: TextPreprocessor;
    private embeddingService: EmbeddingService;
    private userProfile: UserProfileData;
    private summaryRef: SummaryRef | null = null;


	constructor(userProfile: UserProfileData) {

        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        const agentID = process.env.ELEVENLABS_AGENT_ID;
        const elevenLabsBaseUrl = process.env.ELEVENLABS_BASE_URL;
        const agentNumber = process.env.TWILIO_NUMBER;
        const agentNumberId = process.env.ELEVENLABS_NUMBER_ID;

        if (!elevenLabsApiKey || !agentID || !elevenLabsBaseUrl || !agentNumber || !agentNumberId) {
            throw new Error('Missing required ElevenLabs environment variables');
        }
        const elevenLabsConfigs = {
            apiKey: elevenLabsApiKey,
            agentID,
            baseUrl: elevenLabsBaseUrl,
            agentNumber,
            agentNumberId
        };

        this.elevenLabsClient = new ElevenLabsClient(elevenLabsConfigs);

        const apiKey = process.env.OPENAI_API_KEY;
        const baseUrl = process.env.OPENAI_BASE_URL;

        if (!apiKey) {
            throw new Error('Missing required OPENAI_API_KEY environment variable');
        }

        this.openAIClient = new OpenAIClient({
            apiKey,
            baseUrl
        });

        const collectionName = process.env.QDRANT_COLLECTION;
        const qdrantApiKey = process.env.QDRANT_API_KEY;
        const qdrantBaseUrl = process.env.QDRANT_URL;

        if(!collectionName || !qdrantApiKey || !qdrantBaseUrl) {
            throw new Error('Missing required Qdrant environment variable');
        }

        this.qdrantClient = new QdrantClient({
            baseUrl: qdrantBaseUrl,
            apiKey: qdrantApiKey,
            collectionName
        })

        this.redisClient = RedisClient.getInstance();
        this.textPreprocessor = new TextPreprocessor();
        this.embeddingService = new EmbeddingService(
            this.openAIClient,
            this.textPreprocessor
        );

        this.userProfile = userProfile;
	}

	async generateAndSaveConversationSummary(userId: string, conversationId: string) {
		try {
			console.log(`[Summary] Starting summary generation for conversation ${conversationId}`);

			const transcript = await this.elevenLabsClient.getStructuredTranscriptWithRetry(conversationId);
			if (!transcript || transcript.length === 0) {
				console.error('[Summary]  No transcript available');
				throw new Error('No transcript available for conversation');
			}

			console.log('[Summary]  Transcript retrieved');

			const summary = await this.generateConversationSummary(transcript);

			console.log('[Summary] Saving to PostgreSQL...');
			const conversationSummary = await createSummary({
					userId: userId,
					conversationId: conversationId,
					summaryText: summary.summaryText,
					topicsDiscussed: summary.topicsDiscussed,
					keyHighlights: summary.keyHighlights
			});

			console.log('[Summary]  Saved to PostgreSQL');

			this.summaryRef = {
				conversationId,
				summaryId: conversationSummary.id,
				topicsDiscussed: summary.topicsDiscussed,
				keyHighlights: summary.keyHighlights
			};

		} catch (error) {
			console.error('[Summary]  Failed to generate and save conversation summary:', error);
			throw error;
		}
	}

    async updateConversationTopicData() {
        if (this.userProfile.isFirstCall) {
            for (const topic of this.summaryRef?.topicsDiscussed || []) {
                try {
                    await this.createNewTopic(topic);
                } catch (error) {
                    console.error("Unable to create new topic")
                    throw error;
                }
            }
        } else {
            const existingTopics = await getConversationTopics(this.userProfile.id);
            for (const topic of this.summaryRef?.topicsDiscussed || []) {
                try {
                    await this.updateTopic(topic, existingTopics);
                } catch (error) {
                    console.error("Unable to update topic")
                    throw error;
                }
            }
        }
    }

    private async updateTopic(newTopic: string, existingTopics: ReturnedTopic[]) {
        const similarityThreshold = 0.85;
        let isSimilar = false;
        const result = await this.embeddingService.generateEmbedding(newTopic);
        const newTopicEmbedding = result.embedding;
        for (const existingTopic of existingTopics) {
            const similarity = cosine(existingTopic.topicEmbedding, newTopicEmbedding);
            if (similarity && similarity > similarityThreshold) {
                isSimilar = true;
                await updateConversationTopic(this.userProfile.id, existingTopic.topicName, newTopic);
                await createConversationReferences({
                    conversationSummaryId: this.summaryRef?.summaryId!,
                    conversationTopicId: existingTopic.id
                });
                break;
            }
        }
        if (!isSimilar) {
            await this.createNewTopic(newTopic);
        }
    }

    private async createNewTopic(topic: string) {
        try {
            const result = await this.embeddingService.generateEmbedding(topic);
            const embedding = result.embedding;
            const newTopic = await createConversationTopic({
                userId: this.userProfile.id,
                topicName: topic,
                topicEmbedding: embedding
            });
            await createConversationReferences({
                conversationSummaryId: this.summaryRef?.summaryId!,
                conversationTopicId: newTopic.id
            });
        } catch (error) {
            console.error("Unable to create new topic")
            throw error;
        }
    }

    async updateVectorDB() {
        const highlights = this.summaryRef?.keyHighlights || [];
        if (highlights.length === 0) return;

        // Batch generate embeddings for all highlights
        const embeddingResults = await this.embeddingService.generateEmbeddings(highlights);

        const points: ConversationPoint[] = highlights.map((highlight, i) => ({
            id: randomUUID(),
            vector: embeddingResults[i].embedding,
            payload: {
                userId: this.userProfile.id,
                conversationId: this.summaryRef?.conversationId!,
                highlight: highlight,  // Keep original raw text
            }
        }));

        if (points.length > 0) {
            const result = await this.qdrantClient.postToCollection(points);
            if (result.success) {
                console.log('[PostCallService] Vector DB updated with', points.length, 'highlights');
            } else {
                console.error('[PostCallService] Failed to update Vector DB - highlights were not stored');
                throw new Error('Failed to store highlights in vector database');
            }
        }
    }

    // deal with updating this during call for websocket service instead maybe?
    private async updateCallLog() {

    }

    private async generateConversationSummary(transcript: TranscriptMessage[]) {
        try {
            const formattedTranscript = transcript
                .map(msg => `${msg.role === 'user' ? 'User' : 'nAIber'}: ${msg.message}`)
                .join('\n\n');
            const messages: Message[] = [
                {
                    role: 'system',
                    content: `You are analyzing a conversation between nAIber (an AI companion) and an elderly user.
                        Your task is to create a structured summary that will be used in the next conversation.

                        Return a JSON object with this exact structure:
                        {
                        "summaryText": "A 2-3 sentence summary of the conversation covering main topics and user's mood/state",
                        "topicsDiscussed": ["topic1", "topic2", "topic3"],
                        "keyHighlights": ["notable thing user mentioned 1", "notable thing user mentioned 2"]
                        }

                        Guidelines:
                        - Focus on what the USER said, not what nAIber said
                        - Capture topics the user seemed engaged with
                        - Note any important life updates, health mentions, or emotional moments
                        - Keep it concise but meaningful
                        - Include user's emotional tone in the summaryText`
                },
                {
                    role: 'user',
                    content: `Conversation transcript:\n\n${formattedTranscript}`
                }
            ]
            const response = await this.openAIClient.generalGPTCall({
                messages,
                response_format: { type: 'json_object' }
            })
            if (!response.choices[0].message.content) {
                throw new Error('[ConversationHandler] Failed to generate conversation summary');
            }
            const summary = JSON.parse(response.choices[0].message.content);
			console.log('[OpenAI]  Conversation summary generated successfully');
			return summary;
        } catch(error) {
            console.error('[ConversationHandler] Failed to generate conversation summary', error);
            throw new Error('[ConversationHandler] Failed to generate conversation summary');
        }
    }
}
