import { Queue } from 'bullmq';
import { PostCallJobData, POST_CALL_QUEUE_NAME } from '@naiber/shared-core';

export class PostCallQueue {
    private static instance: PostCallQueue;
    private queue: Queue<PostCallJobData>;
    private processedConversations: Set<string>;

    private constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        this.queue = new Queue<PostCallJobData>(POST_CALL_QUEUE_NAME, {
            connection: {
                host: new URL(redisUrl).hostname,
                port: parseInt(new URL(redisUrl).port || '6379')
            },
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                },
                removeOnComplete: {
                    count: 100
                },
                removeOnFail: {
                    count: 50
                }
            }
        });

        this.processedConversations = new Set<string>();

        console.log('[PostCallQueue] Queue instance created');
    }

    static getInstance(): PostCallQueue {
        if (!PostCallQueue.instance) {
            PostCallQueue.instance = new PostCallQueue();
        }

        return PostCallQueue.instance;
    }

    async add(jobName: string, data: PostCallJobData) {
        if (this.processedConversations.has(data.conversationId)) {
            console.log(`[PostCallQueue] Already queued job for conversation ${data.conversationId}, skipping duplicate`);
            return null;
        }

        this.processedConversations.add(data.conversationId);
        const job = await this.queue.add(jobName, data);

        setTimeout(() => {
            this.processedConversations.delete(data.conversationId);
            console.log(`[PostCallQueue] Cleaned up tracking for conversation ${data.conversationId}`);
        }, 300000);

        return job;
    }
}
