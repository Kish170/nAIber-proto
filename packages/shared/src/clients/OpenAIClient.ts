import OpenAI from 'openai';
import { ChatCompletion } from 'openai/resources/index.mjs';
import { Stream } from 'openai/streaming.mjs';
import { TranscriptMessage } from '@naiber/shared';

export interface OpenAIConfigs {
    apiKey: string;
    baseUrl?: string;  // Optional, defaults to OpenAI's API
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
}

export class OpenAIClient {
    private openai: OpenAI;

    constructor(configs: OpenAIConfigs) {
        this.openai = new OpenAI({
            apiKey: configs.apiKey,
            baseURL: configs.baseUrl  
        });
    }

    async generalGPTCall(request: ChatCompletionRequest): Promise<ChatCompletion> {
        try {
            const oaiRequest: OpenAI.Chat.ChatCompletionCreateParams = {
                messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
                model: request.model ?? "gpt-4o",
                temperature: request.temperature ?? 0.7,
                stream: false,
                ...(request.max_tokens && { max_tokens: request.max_tokens }),
                ...(request.user_id && { user: request.user_id })
            };

            return await this.openai.chat.completions.create(oaiRequest) as ChatCompletion;
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