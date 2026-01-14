import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

export function BullBoardRouter(): Router {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    const postCallQueue = new Queue('post-call-processing', {
        connection: {
            host: new URL(redisUrl).hostname,
            port: parseInt(new URL(redisUrl).port || '6379')
        }
    });

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
        queues: [new BullMQAdapter(postCallQueue)],
        serverAdapter
    });

    return serverAdapter.getRouter();
}