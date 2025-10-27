import { ElevenLabsClient, ElevenLabsConfigs } from "../clients/ElevenlabsClient.js";
import { UserProfile } from "../repositories/UserRespository.js";
import { WebSocket } from 'ws';
import { buildFirstMessage, buildSystemPrompt } from '../tools/SystemPrompts.js';

export class WebSocketService {
    private twilioWs: WebSocket;
    private elevenLabsClient: ElevenLabsClient;
    private elevenlabsWs: WebSocket | null = null;
    private streamSID: string = "";
    private conversationId: string = "";
    private keepAliveInterval?: NodeJS.Timeout;

    constructor(twilioWs: WebSocket, elevenLabsConfig: ElevenLabsConfigs) {
        this.twilioWs = twilioWs;
        this.elevenLabsClient = new ElevenLabsClient(elevenLabsConfig);
    }

    // TWILIO SETUP
    twilioEventProcessor(message: Buffer) {
        try {
            const data = JSON.parse(message.toString());

            // Log all incoming Twilio events for debugging
            console.log('[TwilioClient] Received event:', data.event, data.streamSid ? `streamSid: ${data.streamSid}` : '');

            switch (data.event) {
                case "connected":
                    this.manageConnectedEvent(data);
                    break;
                case "start":
                    this.manageStartEvent(data);
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

    closeWSConnection() {
        // TODO: Add cleanup logic if needed
        console.log('[TwilioClient] WebSocket connection closing');
    }

    private manageConnectedEvent(data: any) {
        // add logic if needed
        console.log('[TwilioClient] Connected event:', data);
    }

    private manageStartEvent(data: any) {
        console.log('[WebSocketService] Start event received:', JSON.stringify(data, null, 2));
        this.streamSID = data.start.streamSid;
        console.log('[WebSocketService] Twilio stream started - streamSid:', this.streamSID);
    }

    private manageMediaEvent(data: any) {
        // Capture streamSid from first media event if not already set
        if (!this.streamSID && data.streamSid) {
            this.streamSID = data.streamSid;
            console.log('[WebSocketService] Captured streamSid from media event:', this.streamSID);
        }

        // Forward audio to ElevenLabs
        if (data.media?.payload) {
            this.sendAudioToElevenLabs(data.media.payload);
        }
    }

    private manageStopEvent(data: any) {
        // add logic
        console.log('[TwilioClient] Stop event:', data);
    }

    private manageMarkEvent(data: any) {
        // add logic
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

    // ELEVEN LABS SETUP
    async connectToElevenLabs(userProfile: UserProfile): Promise<void> {
        try {
            console.log('[WebSocketService] Connecting to ElevenLabs');

            const signedUrl = await this.elevenLabsClient.getSignedURL();
            const systemPrompt = buildSystemPrompt(userProfile);
            const firstMessage = buildFirstMessage(userProfile);
            const userName = userProfile.name;

            console.log('[WebSocketService] Creating ElevenLabs WebSocket connection');
            this.elevenlabsWs = new WebSocket(signedUrl);

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
                }
            },
        };

        this.elevenlabsWs!.send(JSON.stringify(initMessage));
    }

    private handleMessage(data: any): void {
        try {
            const msg = JSON.parse(data.toString());

            if (msg.type !== 'audio' && msg.type !== 'ping') {
                console.log('[WebSocketService] ElevenLabs message:', {
                    type: msg.type,
                    conversation_id: msg.conversation_id
                });
            }

            if (msg.conversation_initiation_metadata_event?.conversation_id) {
                this.conversationId = msg.conversation_initiation_metadata_event.conversation_id;
                console.log(`[WebSocketService] Captured conversation ID: ${this.conversationId}`);
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

    private handleClose(code: number, reason: Buffer): void {
        console.log(`[WebSocketService] ElevenLabs WebSocket closed, code: ${code}, reason: ${reason.toString()}`);

        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            console.log('[WebSocketService] Cleared keepalive interval');
        }

        // TODO: Handle cleanup - save transcript, etc.
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