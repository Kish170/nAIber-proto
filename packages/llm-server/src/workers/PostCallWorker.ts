import { Worker, Job } from 'bullmq';
import { OpenAIClient, EmbeddingService, VectorStoreClient, ElevenLabsClient } from '@naiber/shared';
import { PostCallGraph } from '../graphs/PostCallGraph.js';

export interface PostCallJobData {
    conversationId: string;
    userId: string;
    isFirstCall: boolean;
    timestamp: number;
}

export class PostCallWorker {
    private worker: Worker<PostCallJobData>;
    private postCallGraph: any;

    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        const openAIClient = new OpenAIClient({
            apiKey: process.env.OPENAI_API_KEY!,
            baseUrl: process.env.OPENAI_BASE_URL
        });

        const embeddingModel = openAIClient.returnEmbeddingModel();
        const embeddingService = new EmbeddingService(openAIClient);

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

        this.postCallGraph = new PostCallGraph(
            openAIClient,
            embeddingService,
            vectorStore,
            elevenLabsClient
        ).compile();

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
        const { conversationId, userId, isFirstCall } = job.data;

        console.log(`[PostCallWorker] Processing job ${job.id} for conversation ${conversationId}`);

        try {
            const result = await this.postCallGraph.invoke({
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

        } catch (error) {
            console.error(`[PostCallWorker] Job ${job.id} failed:`, error);
            throw error;  
        }
    }

    async close(): Promise<void> {
        console.log('[PostCallWorker] Closing worker...');
        await this.worker.close();
    }
}