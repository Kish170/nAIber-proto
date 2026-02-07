import { ElevenLabsClient, ElevenLabsConfigs, OpenAIClient, RedisClient } from "@naiber/shared";
import { UserProfile } from "@naiber/shared";
import { WebSocket } from 'ws';
import { buildGeneralFirstMessage, buildGeneralSystemPrompt } from './GeneralPrompt.js';
import { buildHealthFirstMessage, buildHealthSystemPrompt } from './HealthPrompt.js';
import { TwilioClient } from "../clients/TwilioClient.js";
import { sessionManager } from "./SessionManager.js";
import { PostCallQueue } from "../queues/PostCallQueue.js";

export interface WebSockets {
    twilioWs: WebSocket;
    elevenLabsWs: WebSocket;
}

export class WebSocketService {
    private twilioWs: WebSocket;
    private elevenLabsClient: ElevenLabsClient;
    private openAIClient: OpenAIClient;
    private twilioClient: TwilioClient | null = null;
    private elevenlabsWs: WebSocket | null = null;
    private streamSID: string = "";
    private conversationId: string = "";
    private callSid: string = "";
    private keepAliveInterval?: NodeJS.Timeout;
    private localConnections: Map<string, WebSockets> = new Map();
    private startedAt: Date = new Date();
    private userProfile: UserProfile | null = null;
    private postCallWorkflowCompleted: boolean = false;
    private callType: 'general' | 'health_check' = 'general';

    constructor(twilioWs: WebSocket, elevenLabsConfig: ElevenLabsConfigs, callType: string, twilioClient?: TwilioClient) {
        this.twilioWs = twilioWs;
        this.elevenLabsClient = new ElevenLabsClient(elevenLabsConfig);
        this.twilioClient = twilioClient || null;
        this.openAIClient = new OpenAIClient({
            apiKey: process.env.OPENAI_API_KEY!,
            baseUrl: process.env.OPENAI_BASE_URL!
        });
        this.callType = callType === 'health_check' ? 'health_check' : 'general';
    }

    async twilioEventProcessor(message: Buffer): Promise<void> {
        try {
            const data = JSON.parse(message.toString());

            switch (data.event) {
                case "connected":
                    this.manageConnectedEvent(data);
                    break;
                case "start":
                    await this.manageStartEvent(data);
                    break;
                case "media":
                    this.manageMediaEvent(data);
                    break;
                case "stop":
                    this.manageStopEvent(data);
                    break;
                case "mark":
                    this.manageMarkEvent(data);
                    break;
                default:
                    console.log('[TwilioClient] Unknown event:', data.event, JSON.stringify(data));
            }
        } catch (error) {
            console.error('[TwilioClient] Error processing message:', error);
        }
    }

    async closeWSConnection(): Promise<void> {
        console.log('[WebSocketService] Closing WebSocket connections and ending call');

        this.processPostCallWorkflow().catch(error => {
            console.error('[WebSocketService] Post-call workflow failed but continuing cleanup:', error);
        });

        if (this.conversationId) {
            await sessionManager.deleteSession(this.conversationId);
        }
        this.deleteLocalConnection(this.callSid);

        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            console.log('[WebSocketService] Cleared keepalive interval');
        }

        if (this.elevenlabsWs && this.elevenlabsWs.readyState === WebSocket.OPEN) {
            console.log('[WebSocketService] Closing ElevenLabs WebSocket');
            this.elevenlabsWs.close();
            this.elevenlabsWs = null;
        }

        if (this.twilioWs && this.twilioWs.readyState === WebSocket.OPEN) {
            console.log('[WebSocketService] Closing Twilio WebSocket');
            this.twilioWs.close();
        }

        if (this.callSid && this.twilioClient) {
            console.log('[WebSocketService] Ending Twilio call via API:', this.callSid);
            try {
                const result = await this.twilioClient.endCall(this.callSid);
                if (result.success) {
                    console.log('[WebSocketService] Successfully ended Twilio call');
                } else {
                    console.error('[WebSocketService] Failed to end Twilio call:', result.error);
                }
            } catch (error) {
                console.error('[WebSocketService] Error ending Twilio call:', error);
            }
        }
    }

    private manageConnectedEvent(data: any): void {
        console.log('[TwilioClient] Connected event:', data);
    }

    private async manageStartEvent(data: any): Promise<void> {
        console.log('[WebSocketService] Start event received:', JSON.stringify(data, null, 2));
        this.streamSID = data.start.streamSid;
        this.callSid = data.start.callSid;
        console.log('[WebSocketService] Twilio stream started - streamSid:', this.streamSID, 'callSid:', this.callSid);

        const redisClient = RedisClient.getInstance();
        const storedCallType = await redisClient.get(`call_type:${this.callSid}`);
        this.callType = (storedCallType as 'general' | 'health_check') || 'general';

        console.log('[WebSocketService] Retrieved callType for callSid:', this.callSid, this.callType);
    }

    private manageMediaEvent(data: any): void {
        if (!this.streamSID && data.streamSid) {
            this.streamSID = data.streamSid;
            console.log('[WebSocketService] Captured streamSid from media event:', this.streamSID);
        }

        if (data.media?.payload) {
            this.sendAudioToElevenLabs(data.media.payload);
        }
    }

    private manageStopEvent(data: any): void {
        console.log('[TwilioClient] Stop event:', data);
        if (!this.callSid && data.stop?.callSid) {
            this.callSid = data.stop.callSid;
            console.log('[WebSocketService] Captured callSid from stop event:', this.callSid);
        }
    }

    private manageMarkEvent(data: any): void {
        console.log('[TwilioClient] Mark event:', data);
    }

    private sendAudioToElevenLabs(audioPayload: string): void {
        if (this.elevenlabsWs && this.elevenlabsWs.readyState === WebSocket.OPEN) {
            this.elevenlabsWs.send(
                JSON.stringify({
                    user_audio_chunk: Buffer.from(audioPayload, 'base64').toString('base64'),
                })
            );
        } else {
            console.warn('[ElevenLabs] Cannot send audio - WebSocket not open');
        }
    }

    async connectToElevenLabs(userProfile: UserProfile): Promise<void> {
        try {
            console.log('[WebSocketService] Connecting to ElevenLabs');

            this.userProfile = userProfile;

            const signedUrl = await this.elevenLabsClient.getSignedURL();

            let systemPrompt: string;
            let firstMessage: string;

            switch (this.callType) {
                case 'health_check':
                    systemPrompt = buildHealthSystemPrompt();
                    firstMessage = await buildHealthFirstMessage(userProfile, this.openAIClient);
                    break;

                case 'general':
                default:
                    systemPrompt = buildGeneralSystemPrompt();
                    firstMessage = await buildGeneralFirstMessage(userProfile, this.openAIClient);
                    break;
            }


            console.log('[WebSocketService] Creating ElevenLabs WebSocket connection');
            this.elevenlabsWs = new WebSocket(signedUrl);

            if (this.elevenlabsWs) {
                this.localConnections.set(this.callSid, {
                    twilioWs: this.twilioWs,
                    elevenLabsWs: this.elevenlabsWs
                });
                console.log('[WebSocketService] Stored local connections for callSid:', this.callSid);
            } else {
                console.warn('[WebSocketService] ElevenLabs WebSocket not ready, cannot store connections');
            }

            this.elevenlabsWs.on('open', () => this.handleOpen(systemPrompt, firstMessage));
            this.elevenlabsWs.on('message', (data: any) => this.handleMessage(data));
            this.elevenlabsWs.on('error', (error: any) => this.handleError(error));
            this.elevenlabsWs.on('close', (code: any, reason: any) => this.handleClose(code, reason));

        } catch (error) {
            console.error('[WebSocketService] Failed to connect to ElevenLabs:', error);
            throw new Error(`Unable to connect to ElevenLabs: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private handleOpen(systemPrompt: string, firstMessage: string): void {
        console.log('[WebSocketService] ElevenLabs WebSocket connected successfully');

        this.keepAliveInterval = setInterval(() => {
            if (this.elevenlabsWs && this.elevenlabsWs.readyState === WebSocket.OPEN) {
                this.elevenlabsWs.ping();
                console.log('[WebSocketService] Sent keepalive ping to ElevenLabs');
            }
        }, 30000);

        const initMessage = {
            type: 'conversation_initiation_client_data',
            conversation_config_override: {
                agent: {
                    prompt: {
                        prompt: systemPrompt
                    },
                    first_message: firstMessage,
                    language: 'en',
                    auto_start_conversation: true
                },
                llm: {
                    user_id: this.userProfile!.id 
                },
                tts: {
                    voice_id: process.env.ELEVENLABS_VOICE_ID
                },
                conversation: {
                    client_events: {
                        enable_user_transcription: true,
                        enable_agent_response: true
                    }
                },
                asr: {
                    quality: 'high',
                    user_input_audio_format: 'pcm_mulaw'
                }
            },
        };

        this.elevenlabsWs!.send(JSON.stringify(initMessage));
    }

    private handleMessage(data: any): void {
        try {
            const msg = JSON.parse(data.toString());

            const importantEvents = ['conversation_initiation_metadata', 'user_transcript', 'agent_response', 'interruption'];
            if (importantEvents.includes(msg.type)) {
                console.log('[WebSocketService] ElevenLabs message:', {
                    type: msg.type,
                    conversation_id: this.conversationId
                });
            }

            if (msg.conversation_initiation_metadata_event?.conversation_id) {
                this.conversationId = msg.conversation_initiation_metadata_event.conversation_id;
                console.log(`[WebSocketService] Captured conversation ID: ${this.conversationId}`);

                this.registerSession().catch(error => {
                    console.error('[WebSocketService] Failed to register session:', error);
                });
            }
            this.sendAudioToTwilio(msg);

        } catch (error) {
            console.error('[WebSocketService] Error processing ElevenLabs message:', error);
        }
    }

    private sendAudioToTwilio(audioPayload: any): void {
        if (audioPayload.audio?.chunk || audioPayload.audio_event?.audio_base_64) {
            if (this.twilioWs && this.twilioWs.readyState === WebSocket.OPEN) {
                if (!this.streamSID) {
                    console.warn('[WebSocketService] Cannot send audio to Twilio - streamSid not set yet');
                    return;
                }

                this.twilioWs.send(
                    JSON.stringify({
                        event: 'media',
                        streamSid: this.streamSID,
                        media: {
                            payload: audioPayload.audio?.chunk || audioPayload.audio_event.audio_base_64,
                        },
                    })
                );
            } else {
                console.warn('[WebSocketService] Cannot send audio - Twilio WebSocket not open');
            }
        }
    }

    private handleError(error: Error): void {
        console.error('[WebSocketService] ElevenLabs WebSocket error:', error);
    }

    private async handleClose(code: number, reason: Buffer): Promise<void> {
        const reasonText = reason.toString() || 'No reason provided';
        console.log(`[WebSocketService] ElevenLabs WebSocket closed`);
        console.log(`[WebSocketService] Close code: ${code}, reason: ${reasonText}`);

        await this.closeWSConnection();
    }

    private async processPostCallWorkflow(): Promise<void> {
        try {
            if (this.postCallWorkflowCompleted) {
                console.log('[WebSocketService] Post-call workflow already completed, skipping');
                return;
            }

            if (!this.userProfile) {
                console.error('[WebSocketService] Cannot process post-call workflow: user profile not available');
                return;
            }

            if (!this.conversationId) {
                console.error('[WebSocketService] Cannot process post-call workflow: conversation ID not available');
                return;
            }

            console.log('[WebSocketService] Starting post-call workflow for conversation:', this.conversationId);

            console.log('[WebSocketService] Waiting 3 seconds for transcript to be ready...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            const postCallQueue = PostCallQueue.getInstance();

            const job = await postCallQueue.add('process-post-call', {
                conversationId: this.conversationId,
                userId: this.userProfile.id,
                isFirstCall: this.userProfile.isFirstCall,
                timestamp: Date.now()
            });

            if (job) {
                console.log(`[WebSocketService] Post-call job ${job.id} queued successfully`);
            } else {
                console.log(`[WebSocketService] Post-call job already queued for conversation ${this.conversationId}`);
            }
            this.postCallWorkflowCompleted = true;

        } catch (error) {
            console.error('[WebSocketService] Error in post-call workflow:', error);
            this.postCallWorkflowCompleted = true; 
        }
    }

    private async deleteLocalConnection(callSid: string): Promise<boolean> {
        const deleted = this.localConnections.delete(callSid);
        if (!deleted) {
            console.warn('[WebSocketService] No local connection found for callSid:', callSid);
        }
        return deleted;
    }

    private async registerSession(): Promise<void> {
        if (!this.userProfile || !this.conversationId) {
            console.warn('[WebSocketService] Cannot register session: missing userProfile or conversationId');
            return;
        }

        const ttl = 3600;

        try {
            const redisInstance = RedisClient.getInstance();

            await sessionManager.createSession(this.conversationId, {
                callSid: this.callSid,
                conversationId: this.conversationId,
                userId: this.userProfile.id,
                phone: this.userProfile.phone,
                streamSid: this.streamSID,
                startedAt: this.startedAt.toISOString(),
                lastMessageAt: new Date().toISOString(),
                callType: this.callType
            });

            await redisInstance.set(`rag:user:${this.userProfile.id}`, this.conversationId, { EX: ttl });
            await redisInstance.set(`rag:phone:${this.userProfile.phone}`, this.conversationId, { EX: ttl });

            console.log('[WebSocketService] Registered session:', {
                conversationId: this.conversationId,
                userId: this.userProfile.id,
                callType: this.callType
            });
        } catch (error) {
            console.error('[WebSocketService] Failed to register session in Redis:', error);
        }
    }

    closeConnection(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }

        if (this.elevenlabsWs) {
            this.elevenlabsWs.close();
            this.elevenlabsWs = null;
        }
    }

    getConversationId(): string {
        return this.conversationId;
    }
}