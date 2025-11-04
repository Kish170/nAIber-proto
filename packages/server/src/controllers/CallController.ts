import { TwilioClient } from '../clients/TwilioClient.js';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { ElevenLabsConfigs } from '@naiber/shared';
import { UserProfile } from '@naiber/shared';
import { WebSocketService } from '../services/WebSocketService.js';

export class CallController {
    private elevenLabsConfigs: ElevenLabsConfigs;
    private twilioClient: TwilioClient;
    private userNumber: string;

    constructor() {
        const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        const agentID = process.env.ELEVENLABS_AGENT_ID;
        const elevenLabsBaseUrl = process.env.ELEVENLABS_BASE_URL;
        const agentNumber = process.env.TWILIO_NUMBER;

        if (!elevenLabsApiKey || !agentID || !elevenLabsBaseUrl || !agentNumber) {
            throw new Error('Missing required ElevenLabs environment variables');
        }
        this.elevenLabsConfigs = {
            apiKey: elevenLabsApiKey,
            agentID,
            baseUrl: elevenLabsBaseUrl,
            agentNumber
        };

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const userNumber = process.env.PHONE_NUMBER
        const baseUrl = process.env.TWILIO_URL
        const streamUrl = process.env.STREAM_URL

        if (!accountSid || !authToken || !userNumber || !baseUrl || !streamUrl) {
            throw new Error('Missing required Twilio environment variables');
        }
        this.userNumber = userNumber;
        this.twilioClient = new TwilioClient({
            accountSid,
            authToken,
            agentNumber,
            baseUrl,
            streamUrl
        })

    }

    async initializeWSServer(server: http.Server): Promise<WebSocketServer> {
        try {
            if (!server) {
                throw new Error('HTTP server is required to create WebSocket server');
            }

            const wss = new WebSocketServer({
                server,
                path: '/outbound-media-stream'
            });

            console.log('[CallController] WebSocket server created at /outbound-media-stream');

            wss.on("connection", (ws: WebSocket): void => {
                console.log('[CallController] Twilio WebSocket connected');

                const webSocketService = new WebSocketService(ws, this.elevenLabsConfigs, this.twilioClient);

                ws.on("message", async (rawData): Promise<void> => {
                    const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData.toString());
                    await webSocketService.twilioEventProcessor(buffer);
                });

                ws.on("close", async (): Promise<void> => {
                    await webSocketService.closeWSConnection();
                });

                (async () => {
                    const userNumber = process.env.PHONE_NUMBER;
                    if (!userNumber) {
                        console.error('[CallController] Missing phone number');
                        ws.close();
                        return;
                    }

                    const userProfile = await UserProfile.loadByPhone(userNumber);
                    if (!userProfile) {
                        console.error('[CallController] User profile not found');
                        ws.close();
                        return;
                    }

                    await webSocketService.connectToElevenLabs(userProfile);
                })();
            });

            return wss;

        } catch (error) {
            console.error('[CallController] Error setting up WebSocket server:', error);
            throw new Error(
                `Failed to setup WebSocket server: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async createCall(): Promise<{ success: boolean; callSid?: string; error?: string }> {
        try {
            console.log('[CallController] Creating outbound call to:', this.userNumber);

            const result = await this.twilioClient.createCall(this.userNumber);

            if (result.success) {
                console.log('[CallController] Call created successfully:', result.callSid);
                return {
                    success: true,
                    callSid: result.callSid
                };
            } else {
                console.error('[CallController] Failed to create call:', result.error);
                return {
                    success: false,
                    error: result.error
                };
            }
        } catch (error) {
            console.error('[CallController] Error creating call:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    generateStreamTwiml(): string {
        try {
            console.log('[CallController] Generating TwiML for agent:', process.env.STREAM_URL);
            return this.twilioClient.generateStreamTwiml(this.elevenLabsConfigs.agentID);
        } catch (error) {
            console.error('[CallController] Error generating TwiML:', error);
            return this.twilioClient.generateErrorTwiml('Unable to connect to the AI assistant. Please try again later.');
        }
    }
}