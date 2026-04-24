import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface UserProfileData {
    id: string;
    name: string;
    age: number | null;
    gender: string | null;
    interests: any[];
    dislikes: any[];
    hasWebAccess: boolean;
    emergencyContact: { name: string; relationship: string; phone: string } | null;
    healthConditions: Array<{ condition: string; severity: string; notes: string }>;
    medications: Array<{ name: string; dosage: string; frequency: string; notes: string }>;
    recentTopics: Array<{ name: string; category: string; lastSummary: string | null }>;
    recentSummaries: string[];
}

export interface MemoriesData {
    highlights: Array<{ text: string; topic: string; similarity: number }>;
    relatedTopics: Array<{ name: string; mentionCount: number }>;
    persons: Array<{ name: string; relationship: string }>;
}

export class McpClient {
    private mcpServerUrl: string;

    constructor(mcpServerUrl: string) {
        this.mcpServerUrl = mcpServerUrl;
    }

    private async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
        const client = new Client({ name: 'naiber-llm-server', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(new URL(`${this.mcpServerUrl}/mcp`));

        try {
            await client.connect(transport);
            const result = await client.callTool({ name: toolName, arguments: args });

            const content = result.content?.[0];
            if (content?.type === 'text') {
                return content.text;
            }
            throw new Error(`Unexpected MCP response content type: ${content?.type}`);
        } finally {
            await client.close().catch(() => {});
        }
    }

    async getUserProfile(userId: string): Promise<UserProfileData> {
        const text = await this.callTool('getUserProfile', { userId });
        return JSON.parse(text) as UserProfileData;
    }

    async retrieveMemories(query: string, userId: string): Promise<MemoriesData> {
        const text = await this.callTool('retrieveMemories', { query, userId });
        return JSON.parse(text) as MemoriesData;
    }
}