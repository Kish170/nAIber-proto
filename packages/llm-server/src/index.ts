import 'dotenv/config';
import express from 'express';
import http from 'http';
import { LLMRouter } from './routes/LLMRoute.js'
import { StatusRouter } from './routes/StatusRoute.js';
import { BullBoardRouter } from './routes/BullBoardRoute.js';
import { PostCallWorker } from './workers/PostCallWorker.js';
import { RedisClient } from '@naiber/shared';
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(StatusRouter());
app.use('/admin/queues', BullBoardRouter());

const server = http.createServer(app);

const PORT = process.env.LLM_PORT || 3001;
const redisClient = RedisClient.getInstance();
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let postCallWorker: PostCallWorker | null = null;
let checkpointer: RedisSaver | null = null;

redisClient.connect().then(async () => {
  console.log('[LLM Server] Redis connected');

  checkpointer = await RedisSaver.fromUrl(REDIS_URL);
  console.log('[LLM Server] RedisSaver checkpointer initialized');

  app.use(LLMRouter(checkpointer));
  server.listen(PORT, () => {
    console.log(`LLM Server running on port ${PORT}`);
    console.log(`Chat completions endpoint: http://localhost:${PORT}/v1/chat/completions`);
    console.log(`Bull Board dashboard: http://localhost:${PORT}/admin/queues`);
    console.log(`RAG enabled: ${process.env.RAG_ENABLED !== 'false'}`);
  });

  postCallWorker = new PostCallWorker(checkpointer);
}).catch(error => {
  console.error('[LLM Server] Failed to connect to Redis:', error);
  process.exit(1);
});

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`Shutdown already in progress, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} received - Shutting down gracefully...`);

  let exitCode = 0;

  try {
    try {
      if (postCallWorker) {
        await postCallWorker.close();
        console.log('PostCallWorker closed');
      }
    } catch (error) {
      console.error('Error closing PostCallWorker:', error);
    }

    try {
      if (checkpointer) {
        await checkpointer.end();
        console.log('RedisSaver closed');
      }
    } catch (error) {
      console.error('Error closing RedisSaver:', error);
    }

    try {
      await redisClient.disconnect();
      console.log('Redis disconnected');
    } catch (error) {
      console.error('Error disconnecting Redis:', error);
    }

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err && (err as any).code !== 'ERR_SERVER_NOT_RUNNING') {
          console.error('Error closing HTTP server:', err);
          reject(err);
        } else {
          console.log('HTTP server closed');
          resolve();
        }
      });
    });

    console.log('Graceful shutdown complete');

  } catch (error) {
    console.error('Error during shutdown:', error);
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
