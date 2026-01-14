import { Queue } from 'bullmq';

export interface PostCallJobData {
    conversationId: string;
    userId: string;
    isFirstCall: boolean;
    timestamp: number;
}

export class PostCallQueue {
    private static instance: Queue<PostCallJobData>;

    static getInstance(): Queue<PostCallJobData> {
        if (!PostCallQueue.instance) {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

            PostCallQueue.instance = new Queue<PostCallJobData>('post-call-processing', {
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

            console.log('[PostCallQueue] Queue instance created');
        }

        return PostCallQueue.instance;
    }
}
