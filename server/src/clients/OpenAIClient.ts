import axios, { AxiosInstance } from 'axios';

export interface OpenAIConfigs {
    apiKey: string;
    baseUrl: string;
}

export class OpenAIClient {
    private client: AxiosInstance;
    private configs: OpenAIConfigs;

    constructor(configs: OpenAIConfigs) {
        this.configs = configs;
        this.client = axios.create({
            baseURL: configs.baseUrl,
            headers: this.getOpenAIHeaders()
        });
    }

    private getOpenAIHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.configs.apiKey}`,
        };
    }

    async generalGPTCall(model: string, systemContent: string, userContent: string, responseFormat: string, temperature: string) {
        try {
            const response = await this.client.post(`/chat/completions`, {
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: systemContent
                    },
                    {
                        role: 'user',
                        content: userContent
                    }
                ],
                reponse_format: responseFormat,
                temperature: temperature
            });

            return response.data;
        } catch (error) {
            console.error('[OpenAI] Failed general task:', error);
			throw new Error('[OpenAI] Call to api with general prompt failed');
        }
    }

    async generateEmbeddings(model: string, text: string): Promise<number[]> {
        try {
            const response = await this.client.post('/embeddings', {
                input: text,
                model: model
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('[OpenAI] Failed to create embedding:', error);
			throw new Error('[OpenAI] Call to api for embedding failed');
        }
    }
}