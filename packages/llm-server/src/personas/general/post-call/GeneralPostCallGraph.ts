import { StateGraph, END } from "@langchain/langgraph";
import { PostCallState, PostCallStateType } from "./PostCallState.js";
import {
    OpenAIClient,
    EmbeddingService,
    VectorStoreClient,
    ElevenLabsClient,
    TranscriptMessage,
    Message
} from "@naiber/shared";
import {
    createSummary,
    getConversationTopics,
    createConversationTopic,
    updateConversationTopic,
    createConversationReferences,
    ReturnedTopic
} from "../ConversationHandler.js";
import { ConversationRepository } from "@naiber/shared";
import cosine from 'compute-cosine-similarity';

export class GeneralPostCallGraph {
    private graph: any;
    private openAIClient: OpenAIClient;
    private embeddingService: EmbeddingService;
    private vectorStore: VectorStoreClient;
    private elevenLabsClient: ElevenLabsClient;
    private similarityThreshold: number = 0.78;

    constructor(openAIClient: OpenAIClient, embeddingService: EmbeddingService, vectorStore: VectorStoreClient, elevenLabsClient: ElevenLabsClient) {
        this.openAIClient = openAIClient;
        this.embeddingService = embeddingService;
        this.vectorStore = vectorStore;
        this.elevenLabsClient = elevenLabsClient;

        this.graph = new StateGraph(PostCallState);

        this.graph.addNode("fetch_transcript", this.fetchTranscript.bind(this));
        this.graph.addNode("generate_summary", this.generateSummary.bind(this));
        this.graph.addNode("match_topics", this.matchTopics.bind(this));
        this.graph.addNode("update_topics", this.updateTopics.bind(this));
        this.graph.addNode("store_embeddings", this.storeEmbeddings.bind(this));

        this.graph.addEdge("fetch_transcript", "generate_summary");
        this.graph.addEdge("generate_summary", "match_topics");
        this.graph.addEdge("match_topics", "update_topics");
        this.graph.addEdge("update_topics", "store_embeddings");
        this.graph.addEdge("store_embeddings", END);

        this.graph.setEntryPoint("fetch_transcript");
    }

    private async fetchTranscript(state: PostCallStateType) {
        try {
            console.log('[PostCallGraph] Fetching transcript for conversation:', state.conversationId);

            const transcript = await this.elevenLabsClient.getStructuredTranscriptWithRetry(state.conversationId);

            if (!transcript || transcript.length === 0) {
                const error = 'No transcript available for conversation';
                console.error('[PostCallGraph]', error);
                return { errors: [error] };
            }

            console.log('[PostCallGraph] Transcript retrieved successfully');

            return { transcript: JSON.stringify(transcript) };

        } catch (error) {
            const errorMsg = `Failed to fetch transcript: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error('[PostCallGraph]', errorMsg);
            return { errors: [errorMsg] };
        }
    }

    private async generateSummary(state: PostCallStateType) {
        try {
            console.log('[PostCallGraph] Generating conversation summary');

            if (state.errors.length > 0) {
                console.log('[PostCallGraph] Skipping summary generation due to previous errors');
                return {};
            }

            const transcript: TranscriptMessage[] = JSON.parse(state.transcript);
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
            ];

            const response = await this.openAIClient.generalGPTCall({
                messages,
                response_format: { type: 'json_object' }
            });

            if (!response.choices[0].message.content) {
                const error = 'Failed to generate conversation summary - empty response';
                console.error('[PostCallGraph]', error);
                return { errors: [error] };
            }

            const summary = JSON.parse(response.choices[0].message.content);
            console.log('[PostCallGraph] Conversation summary generated successfully');

            const conversationSummary = await createSummary({
                userId: state.userId,
                conversationId: state.conversationId,
                summaryText: summary.summaryText,
                topicsDiscussed: summary.topicsDiscussed,
                keyHighlights: summary.keyHighlights
            });

            console.log('[PostCallGraph] Summary saved to PostgreSQL');

            return {
                summary,
                summaryId: conversationSummary.id
            };

        } catch (error) {
            const errorMsg = `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error('[PostCallGraph]', errorMsg);
            return { errors: [errorMsg] };
        }
    }

    private async matchTopics(state: PostCallStateType) {
        try {
            console.log('[PostCallGraph] Matching topics');

            if (state.errors.length > 0) {
                console.log('[PostCallGraph] Skipping topic matching due to previous errors');
                return {};
            }

            if (!state.summary) {
                const error = 'No summary available for topic matching';
                console.error('[PostCallGraph]', error);
                return { errors: [error] };
            }

            const topicsDiscussed = state.summary.topicsDiscussed;

            if (state.isFirstCall) {
                console.log('[PostCallGraph] First call - all topics will be created as new');
                return {
                    topicsToCreate: topicsDiscussed,
                    topicMatchResults: topicsDiscussed.map(topic => ({
                        topic,
                        matchedExisting: false
                    }))
                };
            }

            const existingTopics = await getConversationTopics(state.userId);

            const topicsToCreate: string[] = [];
            const topicsToUpdate: Array<{ oldName: string; newName: string; topicId: string; existingEmbedding: number[]; newEmbedding: number[] }> = [];
            const topicMatchResults: Array<{
                topic: string;
                matchedExisting: boolean;
                existingTopicId?: string;
                similarity?: number;
            }> = [];

            for (const newTopic of topicsDiscussed) {
                const result = await this.embeddingService.generateEmbedding(newTopic);
                const newTopicEmbedding = result.embedding;

                let bestMatch: { topic: ReturnedTopic; similarity: number } | null = null;

                for (const existingTopic of existingTopics) {
                    const similarity = cosine(existingTopic.topicEmbedding, newTopicEmbedding);

                    if (similarity && similarity > this.similarityThreshold) {
                        if (!bestMatch || similarity > bestMatch.similarity) {
                            bestMatch = { topic: existingTopic, similarity };
                        }
                    }
                }

                if (bestMatch) {
                    topicsToUpdate.push({
                        oldName: bestMatch.topic.topicName,
                        newName: newTopic,
                        topicId: bestMatch.topic.id,
                        existingEmbedding: bestMatch.topic.topicEmbedding,
                        newEmbedding: newTopicEmbedding
                    });
                    topicMatchResults.push({
                        topic: newTopic,
                        matchedExisting: true,
                        existingTopicId: bestMatch.topic.id,
                        similarity: bestMatch.similarity
                    });
                    console.log(`[PostCallGraph] Matched topic "${newTopic}" with existing "${bestMatch.topic.topicName}" (similarity: ${bestMatch.similarity.toFixed(3)})`);
                } else {
                    topicsToCreate.push(newTopic);
                    topicMatchResults.push({
                        topic: newTopic,
                        matchedExisting: false
                    });
                    console.log(`[PostCallGraph] No match found for topic "${newTopic}" - will create as new`);
                }
            }

            console.log(`[PostCallGraph] Topic matching complete: ${topicsToCreate.length} new, ${topicsToUpdate.length} matched`);

            return {
                existingTopics,
                topicsToCreate,
                topicsToUpdate,
                topicMatchResults
            };

        } catch (error) {
            const errorMsg = `Failed to match topics: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error('[PostCallGraph]', errorMsg);
            return { errors: [errorMsg] };
        }
    }

    private async updateTopics(state: PostCallStateType) {
        try {
            console.log('[PostCallGraph] Updating topics in database');

            if (state.errors.length > 0) {
                console.log('[PostCallGraph] Skipping topic updates due to previous errors');
                return {};
            }

            for (const topicName of state.topicsToCreate) {
                try {
                    const result = await this.embeddingService.generateEmbedding(topicName);
                    const embedding = result.embedding;

                    const newTopic = await createConversationTopic({
                        userId: state.userId,
                        topicName,
                        topicEmbedding: embedding
                    });

                    await createConversationReferences({
                        conversationSummaryId: state.summaryId!,
                        conversationTopicId: newTopic.id
                    });

                    console.log(`[PostCallGraph] Created new topic: "${topicName}"`);
                } catch (error) {
                    const errorMsg = `Failed to create topic "${topicName}": ${error instanceof Error ? error.message : 'Unknown error'}`;
                    console.error('[PostCallGraph]', errorMsg);
                    return { errors: [errorMsg] };
                }
            }

            for (const { oldName, newName, topicId, existingEmbedding, newEmbedding } of state.topicsToUpdate) {
                try {
                    await updateConversationTopic(state.userId, oldName, newName);

                    const avgEmbedding = existingEmbedding.map((v, i) => (v + newEmbedding[i]) / 2);
                    await ConversationRepository.upsertTopic({
                        userId: state.userId,
                        topicName: newName,
                        topicEmbedding: avgEmbedding
                    });

                    await createConversationReferences({
                        conversationSummaryId: state.summaryId!,
                        conversationTopicId: topicId
                    });

                    console.log(`[PostCallGraph] Updated topic: "${oldName}" → "${newName}" (embedding updated)`);
                } catch (error) {
                    const errorMsg = `Failed to update topic "${oldName}": ${error instanceof Error ? error.message : 'Unknown error'}`;
                    console.error('[PostCallGraph]', errorMsg);
                    return { errors: [errorMsg] };
                }
            }

            console.log('[PostCallGraph] Topic updates complete');

            return {};

        } catch (error) {
            const errorMsg = `Failed to update topics: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error('[PostCallGraph]', errorMsg);
            return { errors: [errorMsg] };
        }
    }

    private async storeEmbeddings(state: PostCallStateType) {
        try {
            console.log('[PostCallGraph] Storing embeddings in vector database');

            if (state.errors.length > 0) {
                console.log('[PostCallGraph] Skipping embeddings storage due to previous errors');
                return {};
            }

            if (!state.summary || state.summary.keyHighlights.length === 0) {
                console.log('[PostCallGraph] No highlights to store');
                return {};
            }

            const highlights = state.summary.keyHighlights;

            if (highlights.length > 0) {
                await this.vectorStore.addMemories(highlights, {
                    userId: state.userId,
                    conversationId: state.conversationId,
                    createdAt: new Date().toISOString(),
                    summaryId: state.summaryId ?? undefined
                });
                console.log(`[PostCallGraph] Stored ${highlights.length} highlights in vector database`);
            }

            return { completed: true };

        } catch (error) {
            const errorMsg = `Failed to store embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error('[PostCallGraph]', errorMsg);
            return { errors: [errorMsg] };
        }
    }

    public compile() {
        return this.graph.compile();
    }
}