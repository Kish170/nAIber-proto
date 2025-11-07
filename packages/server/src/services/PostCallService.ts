import { ElevenLabsClient, OpenAIClient, QdrantClient, createSummary, Message, TranscriptMessage, UserProfileData, createConversationTopic, getConversationTopics, createConversationReferences, ReturnedTopic, updateConversationTopic, ConversationPoint } from '@naiber/shared';
import cosine from 'compute-cosine-similarity';
import { number } from 'zod';

export interface SummaryRef {
    conversationId: string;
	summaryId: string;
	topicsDiscussed: string[];
	keyHighlights: string[];
}


export class ConversationHandler {
    private elevenLabsClient: ElevenLabsClient;
    private openAIClient: OpenAIClient;
    private qdrantClient: QdrantClient;
    private userProfile: UserProfileData;
    private summaryRef: SummaryRef | null = null;


	constructor(userProfile: UserProfileData) {

        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        const agentID = process.env.ELEVENLABS_AGENT_ID;
        const elevenLabsBaseUrl = process.env.ELEVENLABS_BASE_URL;
        const agentNumber = process.env.TWILIO_NUMBER;

        if (!elevenLabsApiKey || !agentID || !elevenLabsBaseUrl || !agentNumber) {
            throw new Error('Missing required ElevenLabs environment variables');
        }
        this.elevenLabsClient = new ElevenLabsClient({
            apiKey: elevenLabsApiKey,
            agentID,
            baseUrl: elevenLabsBaseUrl,
            agentNumber
        });

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

        this.userProfile = userProfile;
	}

	async generateAndSaveConversationSummary(userId: string, conversationId: string) {
		try {
			console.log(`[Summary] Starting summary generation for conversation ${conversationId}`);

			const transcript = await this.elevenLabsClient.getTranscriptWithRetry(conversationId);
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
				keyHighlights: summary.keyHighlights.highlights
			};

		} catch (error) {
			console.error('[Summary]  Failed to generate and save conversation summary:', error);
			throw error;
		}
	}

    private async updateConversationTopicData() {
        if (this.userProfile.isFirstCall) {
            this.summaryRef?.topicsDiscussed.forEach(async (topic) => {
                try {
                    await this.createNewTopic(topic);
                } catch (error) {
                    console.error("Unable to create new topic")
                    throw error;
                }
            });
        } else {
            this.summaryRef?.topicsDiscussed.forEach(async (topic) => {
                const existingTopics = await getConversationTopics(this.userProfile.id);
                try {
                    await this.updateTopic(topic, existingTopics);
                } catch (error) {
                    console.error("Unable to create new topic")
                    throw error;
                }
            });
        }
    }

    private async updateTopic(newTopic: string, existingTopics: ReturnedTopic[]) {
        const similarityThreshold = 0.85;
        let isSimilar = false;
        const newTopicEmbedding = await this.openAIClient.generateEmbeddings(newTopic);
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
            const embedding = await this.openAIClient.generateEmbeddings(topic);
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

    private async updateVectorDB() {
        var points: ConversationPoint[] = []
        this.summaryRef?.keyHighlights.forEach(async (highlight) => {
            const embedding = await this.openAIClient.generateEmbeddings(highlight);
            points.push({
                id: this.summaryRef?.conversationId!,
                vector: embedding,
                payload: {
                    userId: this.userProfile.id,
                    conversationId: this.summaryRef?.conversationId!,
                    highlight: this.summaryRef?.keyHighlights![0]!,  
                }
            });
        });
        const result = await this.qdrantClient.postToCollection(points);
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
                    content: `Conversation transcript:\n\n${formattedTranscript}`
                }
            ]
            const response = await this.openAIClient.generalGPTCall({
                messages,
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
