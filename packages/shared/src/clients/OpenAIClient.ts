import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';

export interface OpenAIConfigs {
    apiKey: string;
    baseUrl?: string; 
}

export interface Message {
    role: string;
    content: string;
}

export interface ChatCompletionRequest {
    messages: Message[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    user_id?: string;
    response_format?: { type: 'json_object' | 'text' };
}

export class OpenAIClient {
    private openai: OpenAI;

    constructor(configs: OpenAIConfigs) {
        this.openai = new OpenAI({
            apiKey: configs.apiKey,
            baseURL: configs.baseUrl  
        });
    }

    async generalGPTCall(request: ChatCompletionRequest): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        try {
            const oaiRequest: OpenAI.Chat.ChatCompletionCreateParams = {
                messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
                model: request.model ?? "gpt-4o",
                temperature: request.temperature ?? 0.7,
                stream: false,
                ...(request.max_tokens && { max_tokens: request.max_tokens }),
                ...(request.user_id && { user: request.user_id }),
                ...(request.response_format && { response_format: request.response_format })
            };

            return await this.openai.chat.completions.create(oaiRequest) as OpenAI.Chat.Completions.ChatCompletion;
        } catch (error) {
            console.error('[OpenAI] Failed general task:', error);
            throw new Error('[OpenAI] Call to api with general prompt failed');
        }
    }

    async streamChatCompletion(request: ChatCompletionRequest): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
        try {
            const oaiRequest: OpenAI.Chat.ChatCompletionCreateParams = {
                messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
                model: request.model ?? "gpt-4o",
                temperature: request.temperature ?? 0.7,
                stream: true,
                ...(request.max_tokens && { max_tokens: request.max_tokens }),
                ...(request.user_id && { user: request.user_id })
            };

            const stream = await this.openai.chat.completions.create(oaiRequest);
            return stream as Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;
        } catch (error) {
            console.error('[OpenAI] Failed to create stream:', error);
            throw new Error('[OpenAI] Call to api with streaming prompt failed');
        }
    }

    async generateEmbeddings(text: string): Promise<number[]> {
        try {
            const response = await this.openai.embeddings.create({
                input: text,
                model: "text-embedding-3-small"
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('[OpenAI] Failed to create embedding:', error);
            throw new Error('[OpenAI] Call to api for embedding failed');
        }
    }
    
    getClient(): OpenAI {
        return this.openai;
    }
}