import { redisClient } from "@naiber/shared";

export interface SessionData {
    callSid: string;
    conversationId: string;
    userId: string;
    phone: string;
    streamSid?: string;
    startedAt: string;
    lastMessageAt: string;
    callType: 'general' | 'health_check';
}

export class SessionManager {
    private static instance: SessionManager;
    private initialized: boolean = false;

    static getInstance(): SessionManager {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager();
        }
        return SessionManager.instance;
    }

    async initialize(): Promise<void> {
        if (!this.initialized) {
            await redisClient.connect();
            this.initialized = true;
            console.log('[SessionManager] Initialized');
        }
    }

    async createSession(conversationId: string, data: SessionData): Promise<void> {
        await redisClient.setJSON(`session:${conversationId}`, data, 3600);
        console.log('[SessionManager] Created session:', conversationId);
    }

    async getSession(conversationId: string): Promise<SessionData | null> {
        return await redisClient.getJSON<SessionData>(`session:${conversationId}`);
    }

    async updateSession(conversationId: string, updates: Partial<SessionData>): Promise<void> {
        const existing = await this.getSession(conversationId);
        if (existing) {
            const updated = { ...existing, ...updates };
            await redisClient.setJSON(`session:${conversationId}`, updated, 3600);
            console.log('[SessionManager] Updated session:', conversationId);
        }
    }

    async deleteSession(conversationId: string): Promise<void> {
        const client = redisClient.getClient();
        await client.del(`session:${conversationId}`);
        console.log('[SessionManager] Deleted session:', conversationId);
    }

    async getAllActiveSessions(): Promise<SessionData[]> {
        const keys = await redisClient.getKeysByPattern('session:*');
        const sessions: SessionData[] = [];

        for (const key of keys) {
            const session = await redisClient.getJSON<SessionData>(key);
            if (session) {
                sessions.push(session);
            }
        }

        return sessions;
    }

    async cleanupExpiredSessions(): Promise<number> {
        return await redisClient.deleteByPattern('session:*');
    }
}

export const sessionManager = SessionManager.getInstance();