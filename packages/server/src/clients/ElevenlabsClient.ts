import axios, { AxiosInstance } from 'axios';

export interface ElevenLabsConfigs {
    apiKey: string;
    agentID: string;
    baseUrl: string;
    agentNumber: string;
}

export class ElevenLabsClient {
    private client: AxiosInstance;
    private configs: ElevenLabsConfigs;

    constructor(configs: ElevenLabsConfigs) {
        if (!configs.apiKey || !configs.agentID || !configs.baseUrl) {
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

    async getTranscript(conversationId: string): Promise<any> {
        try {
            const response = await this.client.get(`/conversations/${conversationId}`);
            return response.data;
        } catch (error) {
            console.error('[ElevenLabs] Failed to get transcript:', error);
            throw new Error(
                `Failed to get transcript: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async initiateCall(): Promise<any> {
        try {
            const response = await this.client.post(`/twilio/outbound-call`, {
                agent_id: this.configs.agentID,
                agent_phone_number_id: this.configs.agentNumber
            });
            return response.data;
        } catch (error) {
            console.error('[ElevenLabs] Failed to initiate simple outbound call:', error);
            throw new Error(
                `Failed to initiate simple outbound call: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}