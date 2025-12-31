import 'dotenv/config';
import express from 'express';
import http from 'http';
import { LLMRouter } from './routes/LLMRoute.js'
import { StatusRouter } from './routes/StatusRoute.js';
import { RedisClient } from '@naiber/shared';

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(LLMRouter());
app.use(StatusRouter());

const server = http.createServer(app);

const PORT = process.env.LLM_PORT || 3001;
const redisClient = RedisClient.getInstance();

redisClient.connect().then(() => {
  console.log('[LLM Server] Redis connected');

  server.listen(PORT, () => {
    console.log(`LLM Server running on port ${PORT}`);
    console.log(`Chat completions endpoint: http://localhost:${PORT}/v1/chat/completions`);
    console.log(`RAG enabled: ${process.env.RAG_ENABLED !== 'false'}`);
  });
}).catch(error => {
  console.error('[LLM Server] Failed to connect to Redis:', error);
  console.error('[LLM Server] Starting server anyway - RAG will be disabled');

  server.listen(PORT, () => {
    console.log(`LLM Server running on port ${PORT} (RAG DISABLED - Redis unavailable)`);
    console.log(`Chat completions endpoint: http://localhost:${PORT}/v1/chat/completions`);
  });
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

process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await gracefulShutdown('UNHANDLED_REJECTION');
});
