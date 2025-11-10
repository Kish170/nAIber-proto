import axios, { AxiosInstance } from 'axios';

export interface CallMessage {
    conversation_id: string;
    call_sid: string;
    status: string;
}

export interface ElevenLabsConfigs {
    apiKey: string;
    agentID: string;
    baseUrl: string;
    agentNumber: string;
    agentNumberId: string;
}

export interface TranscriptMessage {
    message: string;
    role: string;
}

export interface TranscriptData {
    transcript?: Array<{
        message: any;
        role: string;
    }>;
}


export class ElevenLabsClient {
    private client: AxiosInstance;
    private configs: ElevenLabsConfigs;

    constructor(configs: ElevenLabsConfigs) {
        if (!configs.apiKey || !configs.agentID || !configs.baseUrl || !configs.agentNumberId) {
            throw new Error('ElevenLabs configuration error: apiKey, agentID, and baseUrl are required');
        }

        this.configs = configs;
        this.client = axios.create({
            baseURL: configs.baseUrl,
            headers: this.getElevenLabHeaders()
        });
    }

    private getElevenLabHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        }
    }

    async getSignedURL(): Promise<string> {
        try {
            const response = await this.client.get(`/conversation/get_signed_url?agent_id=${this.configs.agentID}`)
            return response.data.signed_url
        } catch (error) {
            console.error('[ElevenLabsClient] Failed to get signed URL:', error);
            throw new Error("Unable to get signed url")
        }
    }

    async getTranscriptWithRetry(conversationId: string, retries = 5, delayMs = 1000): Promise<string> {
        for (let i = 0; i < retries; i++) {
            const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
                headers: {
                    'xi-api-key': process.env.ELEVENLABS_API_KEY!,
                    'Content-Type': 'application/json',
                },
            });

            const data = await res.json() as TranscriptData;
            if (data.transcript && data.transcript.length > 0) {
                return data.transcript.map((turn) => {
                    if (!turn.message) return null;
                    return `${turn.role.toUpperCase()}: ${turn.message}`;
                })
                    .filter(Boolean)
                    .join("\n");
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        throw new Error("Unable to retrieve transcript")
    }

    async getStructuredTranscriptWithRetry(conversationId: string, retries = 5, delayMs = 1000): Promise<TranscriptMessage[]> {
        for (let i = 0; i < retries; i++) {
            const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
                headers: {
                    'xi-api-key': process.env.ELEVENLABS_API_KEY!,
                    'Content-Type': 'application/json',
                },
            });

            const data = await res.json() as TranscriptData;
            if (data.transcript && data.transcript.length > 0) {
                return data.transcript
                    .filter((turn) => turn.message)
                    .map((turn) => ({
                        message: turn.message,
                        role: turn.role
                    }));
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        throw new Error("Unable to retrieve transcript")
    }

    async initiateOutboundCall(phoneNumber: string): Promise<CallMessage> {
        try {
            const payload: any = {
                agentId: this.configs.agentID,
                agentPhoneNumberId: this.configs.agentNumberId,
                toNumber: phoneNumber
            };

            console.log('[ElevenLabsClient] Initiating outbound call to:', phoneNumber);
            const response = await this.client.post(`/twilio/outbound-call`, payload);

            console.log('[ElevenLabsClient] Call initiated successfully:', {
                conversation_id: response.data.conversation_id,
                call_sid: response.data.call_sid
            });

            return {
                conversation_id: response.data.conversation_id,
                call_sid: response.data.call_sid,
                status: response.data.status || 'initiated'
            };
        } catch (error: any) {
            console.error('[ElevenLabsClient] Failed to initiate outbound call');

            if (error.response?.data?.detail) {
                console.error('[ElevenLabsClient] Validation errors:', JSON.stringify(error.response.data.detail, null, 2));
            }
            if (error.response?.data) {
                console.error('[ElevenLabsClient] Full error response:', JSON.stringify(error.response.data, null, 2));
            }

            throw new Error(
                `Failed to initiate outbound call: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}