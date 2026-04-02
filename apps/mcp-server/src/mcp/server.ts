import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserProfileSchema, getUserProfileHandler } from './tools/getUserProfile.js';
import { retrieveMemoriesSchema, retrieveMemoriesHandler } from './tools/retrieveMemories.js';

export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'naiber-mcp-server',
        version: '1.0.0',
    });

    server.tool(
        'getUserProfile',
        'Fetch the elderly user\'s profile from the database. Returns name, age, interests, health conditions, medications, and recent conversation topics for LLM context injection.',
        getUserProfileSchema,
        async ({ userId }) => {
            const profile = await getUserProfileHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }],
            };
        }
    );

    server.tool(
        'retrieveMemories',
        'Search the user\'s past conversation memories using semantic vector search and knowledge graph enrichment. Returns relevant highlights, related topics, and mentioned persons.',
        retrieveMemoriesSchema,
        async ({ query, userId }) => {
            const memories = await retrieveMemoriesHandler({ query, userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(memories, null, 2) }],
            };
        }
    );

    return server;
}
