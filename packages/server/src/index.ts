import express from 'express';
import http from 'http';
import { CallController } from './controllers/CallController.js';
import { CallController2 } from './controllers/CallController2.js';
import { createCallRouter } from './routes/CallRoutes.js';
import { sessionManager } from './services/SessionManager.js';
import { prismaClient } from '@naiber/shared';
import { redisClient } from './clients/RedisClient.js';
import { StatusRouter } from './routes/StatusRoute.js';
import { getNgrokUrls } from './utils/ngrok.js';

await sessionManager.initialize();

const ngrokUrls = await getNgrokUrls();
if (ngrokUrls.baseUrl) {
  process.env.BASE_URL = ngrokUrls.baseUrl;
  process.env.TWILIO_URL = ngrokUrls.twilioUrl;
  process.env.STREAM_URL = ngrokUrls.streamUrl;
}

const app = express();
const callController = new CallController();
const callController2 = new CallController2();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(createCallRouter(callController, callController2));
app.use(StatusRouter());
const server = http.createServer(app);
await callController.initializeWSServer(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ElevenLabs webhook available at: https://4973188fcbd8.ngrok-free.app/api/elevenlabs-webhook`);
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

    console.log('Closing active WebSocket connections...');

    console.log('Disconnecting from database...');
    await prismaClient.$disconnect();
    console.log('Database disconnected');

    console.log('Disconnecting from Redis...');
    await redisClient.disconnect();
    console.log('Redis disconnected');

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
