import { Worker, Job } from 'bullmq';
import { OpenAIClient, EmbeddingService, VectorStoreClient, ElevenLabsClient, RedisClient } from '@naiber/shared';
import { ShallowRedisSaver } from '@langchain/langgraph-checkpoint-redis/shallow';
import { GeneralPostCallGraph } from '../graphs/GeneralPostCallGraph.js';
import { HealthPostCallGraph } from '../graphs/HealthPostCallGraph.js';

export interface PostCallJobData {
    conversationId: string;
    userId: string;
    isFirstCall: boolean;
    callType: 'general' | 'health_check';
    timestamp: number;
}

export class PostCallWorker {
    private worker: Worker<PostCallJobData>;
    private generalPostCallGraph: any;
    private healthPostCallGraph: any;
    private checkpointer: ShallowRedisSaver;

    constructor(checkpointer: ShallowRedisSaver) {
        this.checkpointer = checkpointer;

        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        const openAIClient = new OpenAIClient({
            apiKey: process.env.OPENAI_API_KEY!,
            baseUrl: process.env.OPENAI_BASE_URL
        });

        const embeddingService = new EmbeddingService(openAIClient);
        const embeddingModel = openAIClient.returnEmbeddingModel();

        const vectorStore = new VectorStoreClient({
            baseUrl: process.env.QDRANT_URL!,
            apiKey: process.env.QDRANT_API_KEY!,
            collectionName: process.env.QDRANT_COLLECTION!
        }, embeddingModel);

        const elevenLabsClient = new ElevenLabsClient({
            apiKey: process.env.ELEVENLABS_API_KEY!,
            agentID: process.env.ELEVENLABS_AGENT_ID!,
            baseUrl: process.env.ELEVENLABS_BASE_URL!,
            agentNumber: process.env.TWILIO_NUMBER!,
            agentNumberId: process.env.ELEVENLABS_NUMBER_ID!
        });

        this.generalPostCallGraph = new GeneralPostCallGraph(
            openAIClient,
            embeddingService,
            vectorStore,
            elevenLabsClient
        ).compile();

        this.healthPostCallGraph = new HealthPostCallGraph().compile();

        this.worker = new Worker<PostCallJobData>(
            'post-call-processing',
            async (job: Job<PostCallJobData>) => {
                return await this.processJob(job);
            },
            {
                connection: {
                    host: new URL(redisUrl).hostname,
                    port: parseInt(new URL(redisUrl).port || '6379')
                },
                concurrency: 1,
                limiter: {
                    max: 3,
                    duration: 60000
                }
            }
        );

        this.worker.on('completed', (job) => {
            console.log(`[PostCallWorker] Job ${job.id} completed for conversation ${job.data.conversationId}`);
        });

        this.worker.on('failed', (job, err) => {
            console.error(`[PostCallWorker] Job ${job?.id} failed:`, err.message);
            console.error(`[PostCallWorker] Attempt ${job?.attemptsMade}/${job?.opts.attempts}`);
        });

        this.worker.on('error', (err) => {
            console.error('[PostCallWorker] Worker error:', err);
        });

        console.log('[PostCallWorker] Worker initialized and ready');
    }

    private async processJob(job: Job<PostCallJobData>): Promise<any> {
        const { conversationId, userId, isFirstCall, callType } = job.data;

        console.log(`[PostCallWorker] Processing job ${job.id} for conversation ${conversationId}, callType: ${callType}`);

        try {
            if (callType === 'health_check') {
                return await this.processHealthCheckJob(userId, conversationId);
            }

            if (callType === 'general') {
                const result = await this.generalPostCallGraph.invoke({
                    conversationId,
                    userId,
                    isFirstCall,
                    transcript: '',
                });

                if (result.errors && result.errors.length > 0) {
                    throw new Error(`PostCallGraph errors: ${result.errors.join(', ')}`);
                }

                console.log(`[PostCallWorker] Job ${job.id} completed successfully`);
                console.log(`[PostCallWorker] Topics created: ${result.topicsToCreate?.length || 0}`);
                console.log(`[PostCallWorker] Topics updated: ${result.topicsToUpdate?.length || 0}`);

                return {
                    success: true,
                    conversationId,
                    topicsCreated: result.topicsToCreate?.length || 0,
                    topicsUpdated: result.topicsToUpdate?.length || 0
                };
            }
        } catch (error) {
            console.error(`[PostCallWorker] Job ${job.id} failed:`, error);
            throw error;
        } finally {
            try {
                await RedisClient.getInstance().deleteByPattern(`rag:topic:${conversationId}`);
                console.log(`[PostCallWorker] Cleared topic state for: ${conversationId}`);
            } catch (cleanupErr) {
                console.warn('[PostCallWorker] Topic state cleanup failed (non-fatal):', cleanupErr);
            }
        }
    }

    private async processHealthCheckJob(userId: string, conversationId: string): Promise<any> {
        const threadId = `health_check:${userId}:${conversationId}`;

        console.log(`[PostCallWorker] Processing health check for thread: ${threadId}`);

        try {
            const tuple = await this.checkpointer.getTuple({ configurable: { thread_id: threadId } });
            const rawAnswers: any[] = (tuple?.checkpoint?.channel_values?.healthCheckAnswers as any[]) ?? [];

            console.log(`[PostCallWorker] Found ${rawAnswers.length} answers in thread state`);

            const answers = rawAnswers.map((a: any) => ({
                id: a.question?.id ?? '',
                question: a.question?.question ?? '',
                category: a.question?.category ?? '',
                type: a.question?.type ?? '',
                answer: a.isValid ? a.validatedAnswer : null,
                isValid: a.isValid
            }));

            const result = await this.healthPostCallGraph.invoke({ userId, conversationId, answers });

            if (result.error) {
                throw new Error(result.error);
            }

            await this.checkpointer.deleteThread(threadId);
            console.log(`[PostCallWorker] Cleaned up thread: ${threadId}`);

            return { success: true, conversationId, answersRecorded: answers.length };
        } catch (error) {
            console.error(`[PostCallWorker] Health check persistence failed for thread ${threadId}:`, error);
            throw error;
        }
    }

    async close(): Promise<void> {
        console.log('[PostCallWorker] Closing worker...');
        await this.worker.close();
    }
}
