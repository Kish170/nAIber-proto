import 'dotenv/config';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RedisClient } from '@naiber/shared-clients';
import { Neo4jClient } from '@naiber/shared-clients';
import { createMcpServer } from './mcp/server.js';
import { addHealthQuestionHandler } from './mcp/tools/health/addHealthQuestion.js';

const PORT = parseInt(process.env.MCP_PORT ?? '3002', 10);

async function start() {
    const redis = RedisClient.getInstance();
    await redis.connect();
    console.log('[mcp-server] Redis connected');

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

    app.post('/tools/add_health_question', async (req, res) => {
        try {
            const result = await addHealthQuestionHandler(req.body);
            res.json(result);
        } catch (err: any) {
            console.error('[mcp-server] add_health_question error:', err);
            res.status(500).json({ error: err.message });
        }
    });

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
