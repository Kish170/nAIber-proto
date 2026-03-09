import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import * as trpcExpress from '@trpc/server/adapters/express';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { prismaClient } from '@naiber/shared-clients';

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3003',
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext,
    }),
);

app.get('/status', (_req, res) => {
    res.json({ status: 'ok', service: 'naiber-api' });
});

const PORT = process.env.API_PORT || 3002;

const server = app.listen(PORT, () => {
    console.log(`[API] Server running on port ${PORT}`);
    console.log(`[API] tRPC endpoint: http://localhost:${PORT}/trpc`);
});

async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received — shutting down...`);
    server.close();
    await prismaClient.$disconnect();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
