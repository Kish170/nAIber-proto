import 'dotenv/config';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RedisClient } from '@naiber/shared-clients';
import { Neo4jClient } from '@naiber/shared-clients';
import { createMcpServer } from './mcp/server.js';

const PORT = parseInt(process.env.MCP_PORT ?? '3002', 10);

async function start() {
    // Connect Redis
    const redis = RedisClient.getInstance();
    await redis.connect();
    console.log('[mcp-server] Redis connected');

    // Connect Neo4j
    Neo4jClient.getInstance({
        uri: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
        database: process.env.NEO4J_DATABASE,
    });
    await Neo4jClient.getInstance().verifyConnectivity();

    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', service: 'mcp-server' });
    });

    // MCP endpoint — one transport instance per request (stateless/JSON mode)
    app.post('/mcp', async (req, res) => {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });

        res.on('close', () => {
            transport.close().catch(() => {});
        });

        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });

    app.listen(PORT, () => {
        console.log(`[mcp-server] Listening on port ${PORT}`);
    });

    const shutdown = async () => {
        console.log('[mcp-server] Shutting down...');
        await redis.disconnect();
        await Neo4jClient.getInstance().closeDriver();
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

start().catch(err => {
    console.error('[mcp-server] Fatal startup error:', err);
    process.exit(1);
});
