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
            const contents = Array.isArray(result.content) ? result.content : [];
            const textContent = contents.find(
                (content): content is { type: 'text'; text: string } =>
                    typeof content === 'object' &&
                    content !== null &&
                    'type' in content &&
                    content.type === 'text' &&
                    'text' in content &&
                    typeof content.text === 'string'
            );

            if (result.isError) {
                const message = textContent?.text ?? `MCP tool ${toolName} failed`;
                throw new Error(`MCP tool ${toolName} failed: ${message}`);
            }

            if (textContent) {
                return textContent.text;
            }
            throw new Error(`Unexpected MCP response content type for ${toolName}`);
        } finally {
            await client.close().catch(() => {});
        }
    }

    private parseJsonResponse<T>(toolName: string, text: string): T {
        try {
            return JSON.parse(text) as T;
        } catch {
            throw new Error(`MCP tool ${toolName} returned non-JSON text: ${text}`);
        }
    }

    async getUserProfile(userId: string): Promise<UserProfileData> {
        const text = await this.callTool('getUserProfile', { userId });
        return this.parseJsonResponse<UserProfileData>('getUserProfile', text);
    }

    async retrieveMemories(query: string, userId: string): Promise<MemoriesData> {
        const text = await this.callTool('retrieveMemories', { query, userId });
        return this.parseJsonResponse<MemoriesData>('retrieveMemories', text);
    }
}
