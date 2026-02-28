import { ElevenLabsClient, ElevenLabsConfigs, CallMessage } from '@naiber/shared-clients';
import { sessionManager, SessionData } from '../services/SessionManager.js';

export interface CallResult {
    success: boolean;
    conversationId?: string;
    callSid?: string;
    error?: string;
}

export class CallController2 {
    private elevenLabsClient: ElevenLabsClient;
    private userNumber: string;

    constructor() {
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        const agentID = process.env.ELEVENLABS_AGENT_ID;
        const elevenLabsBaseUrl = process.env.ELEVENLABS_BASE_URL;
        const agentNumber = process.env.TWILIO_NUMBER;
        const agentNumberId = process.env.ELEVENLABS_NUMBER_ID;

        if (!elevenLabsApiKey || !agentID || !elevenLabsBaseUrl || !agentNumber || !agentNumberId) {
            throw new Error('Missing required ElevenLabs environment variables');
        }
        const elevenLabsConfigs = {
            apiKey: elevenLabsApiKey,
            agentID,
            baseUrl: elevenLabsBaseUrl,
            agentNumber,
            agentNumberId
        };

        this.elevenLabsClient = new ElevenLabsClient(elevenLabsConfigs);
        
        const userNumber = process.env.PHONE_NUMBER

        if (!userNumber) {
            throw new Error('Missing user number');
        }
        this.userNumber = userNumber;

        console.log('[CallController2] Initialized');
    }

    async createCall(): Promise<CallResult> {
        try {
            console.log('[CallController2] Initiating outbound call to:', this.userNumber);

            const callData: CallMessage = await this.elevenLabsClient.initiateOutboundCall(this.userNumber);

            console.log('[CallController2] Call initiated:', {
                conversation_id: callData.conversation_id,
                call_sid: callData.call_sid,
                status: callData.status
            });

            const sessionData: SessionData = {
                callSid: callData.call_sid,
                conversationId: callData.conversation_id,
                streamSid: '', 
                startedAt: new Date().toISOString()
            };

            await sessionManager.createSession(callData.call_sid, sessionData);
            console.log('[CallController2] Session created in Redis');

            return {
                success: true,
                conversationId: callData.conversation_id,
                callSid: callData.call_sid
            };

        } catch (error) {
            console.error('[CallController2] Error creating call:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async getSession(callSid: string): Promise<SessionData | null> {
        try {
            return await sessionManager.getSession(callSid);
        } catch (error) {
            console.error('[CallController2] Error getting session:', error);
            return null;
        }
    }

    async getActiveSessions(): Promise<SessionData[]> {
        try {
            return await sessionManager.getAllActiveSessions();
        } catch (error) {
            console.error('[CallController2] Error getting active sessions:', error);
            return [];
        }
    }

    async endCall(callSid: string): Promise<void> {
        try {
            console.log('[CallController2] Ending call:', callSid);
            await sessionManager.deleteSession(callSid);
            console.log('[CallController2] Session deleted');
        } catch (error) {
            console.error('[CallController2] Error ending call:', error);
        }
    }

    async cleanupSessions(): Promise<number> {
        try {
            const count = await sessionManager.cleanupExpiredSessions();
            console.log('[CallController2] Cleaned up', count, 'expired sessions');
            return count;
        } catch (error) {
            console.error('[CallController2] Error cleaning up sessions:', error);
            return 0;
        }
    }
}
