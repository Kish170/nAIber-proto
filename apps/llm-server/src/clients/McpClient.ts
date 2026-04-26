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
    highlights: Array<{ text: string; topic: string; similarity: number; source: string; via?: string }>;
    relatedTopics: Array<{ name: string; mentionCount: number }>;
    persons: Array<{ name: string; relationship: string; via?: string }>;
}

export interface UserBasicInfo {
    id: string;
    name: string;
    age: number | null;
    phone: string | null;
    gender: string | null;
}

export interface UserInterestsData {
    interests: any[];
    dislikes: any[];
    recentTopics: Array<{ name: string; category: string | null; lastSummary: string | null }>;
}

export interface UserMedicalContext {
    healthConditions: Array<{ condition: string; severity: string | null; notes: string | null }>;
    medications: Array<{ name: string; dosage: string | null; frequency: string | null; notes: string | null }>;
}

export interface UserPreferences {
    callFrequency: string | null;
    preferredCallTime: string | null;
    hasWebAccess: boolean;
    gender: string | null;
    enableHealthCheckIns: boolean;
}

export interface RelationshipContextData {
    contacts: Array<{
        name: string;
        relationship: string | null;
        knownDurationYears: number | null;
        contactFrequency: string | null;
        reliabilityTier: string | null;
    }>;
}

export interface InterestsData {
    topics: Array<{ id: string; topicName: string; category: string | null; mentionCount: number; lastUpdated: string }>;
}

export interface SignificantEventsData {
    events: Array<{ text: string; importanceScore: number; conversationDate: string }>;
}

export interface ConversationTopicsData {
    topics: Array<{ id: string; topicName: string }>;
}

export interface FlagCallEventResult {
    id: string;
    eventType: string;
    severity: string | null;
    detectedAt: string;
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

    async endCall(conversationId: string): Promise<{ scheduled: boolean }> {
        const text = await this.callTool('endCall', { conversationId });
        return this.parseJsonResponse<{ scheduled: boolean }>('endCall', text);
    }

    async getUserBasicInfo(userId: string): Promise<UserBasicInfo> {
        const text = await this.callTool('getUserBasicInfo', { userId });
        return this.parseJsonResponse<UserBasicInfo>('getUserBasicInfo', text);
    }

    async getUserInterests(userId: string): Promise<UserInterestsData> {
        const text = await this.callTool('getUserInterests', { userId });
        return this.parseJsonResponse<UserInterestsData>('getUserInterests', text);
    }

    async getUserMedicalContext(userId: string): Promise<UserMedicalContext> {
        const text = await this.callTool('getUserMedicalContext', { userId });
        return this.parseJsonResponse<UserMedicalContext>('getUserMedicalContext', text);
    }

    async getUserPreferences(userId: string): Promise<UserPreferences> {
        const text = await this.callTool('getUserPreferences', { userId });
        return this.parseJsonResponse<UserPreferences>('getUserPreferences', text);
    }

    async getRelationshipContext(userId: string): Promise<RelationshipContextData> {
        const text = await this.callTool('getRelationshipContext', { userId });
        return this.parseJsonResponse<RelationshipContextData>('getRelationshipContext', text);
    }

    async getInterests(userId: string): Promise<InterestsData> {
        const text = await this.callTool('getInterests', { userId });
        return this.parseJsonResponse<InterestsData>('getInterests', text);
    }

    async getSignificantEvents(userId: string, minScore?: number): Promise<SignificantEventsData> {
        const args: Record<string, unknown> = { userId };
        if (minScore !== undefined) args.minScore = minScore;
        const text = await this.callTool('getSignificantEvents', args);
        return this.parseJsonResponse<SignificantEventsData>('getSignificantEvents', text);
    }

    async getConversationTopics(userId: string): Promise<ConversationTopicsData> {
        const text = await this.callTool('getConversationTopics', { userId });
        return this.parseJsonResponse<ConversationTopicsData>('getConversationTopics', text);
    }

    async flagCallEvent(
        userId: string,
        conversationId: string,
        eventType: string,
        description: string,
        severity?: string
    ): Promise<FlagCallEventResult> {
        const args: Record<string, unknown> = { userId, conversationId, eventType, description };
        if (severity !== undefined) args.severity = severity;
        const text = await this.callTool('flagCallEvent', args);
        return this.parseJsonResponse<FlagCallEventResult>('flagCallEvent', text);
    }
}
