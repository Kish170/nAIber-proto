import { redisClient } from "../clients/RedisClient.js";

export interface SessionData {
    callSid: string;
    conversationId: string;
    userId: string;
    streamSid: string;
    startedAt: string; 
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

    async createSession(callSid: string, data: SessionData): Promise<void> {
        await redisClient.setJSON(`session:${callSid}`, data, 7200); 
        console.log('[SessionManager] Created session:', callSid);
    }

    async getSession(callSid: string): Promise<SessionData | null> {
        return await redisClient.getJSON<SessionData>(`session:${callSid}`);
    }

    async updateSession(callSid: string, updates: Partial<SessionData>): Promise<void> {
        const existing = await this.getSession(callSid);
        if (existing) {
            const updated = { ...existing, ...updates };
            await redisClient.setJSON(`session:${callSid}`, updated, 7200);
            console.log('[SessionManager] Updated session:', callSid);
        }
    }

    async deleteSession(callSid: string): Promise<void> {
        const client = redisClient.getClient();
        await client.del(`session:${callSid}`);
        console.log('[SessionManager] Deleted session:', callSid);
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