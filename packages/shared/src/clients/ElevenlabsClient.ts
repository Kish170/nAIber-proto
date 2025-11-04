import axios, { AxiosInstance } from 'axios';

export interface ElevenLabsConfigs {
    apiKey: string;
    agentID: string;
    baseUrl: string;
    agentNumber: string;
}

export interface TranscriptMessage {
    message: string;
    role: string;
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

	async getTranscriptWithRetry(conversationId: string, retries = 5, delayMs = 1000): Promise<TranscriptMessage[]> {
		for (let i = 0; i < retries; i++) {
			const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
				headers: {
					'xi-api-key': process.env.ELEVENLABS_API_KEY!,
					'Content-Type': 'application/json',
				},
			});

			const data = await res.json();
			if (data.transcript && data.transcript.length > 0) {
				return data.transcript.map((turn: { message: any; role: string; }) => {
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