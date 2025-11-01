import { OpenAIClient, type ChatCompletionRequest } from "@naiber/shared";
import type { ChatCompletion } from 'openai/resources/index.mjs';
import type { Stream } from 'openai/streaming.mjs';
import OpenAI from 'openai';

export class LLMController {
    private client: OpenAIClient;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        const baseUrl = process.env.OPENAI_BASE_URL;

        if (!apiKey) {
            throw new Error('Missing required OPENAI_API_KEY environment variable');
        }

        this.client = new OpenAIClient({
            apiKey,
            baseUrl
        });
    }

    async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletion> {
        try {
            return await this.client.generalGPTCall(request);
        } catch (error) {
            console.error('[LLM Controller] Failed chat completion:', error);
            throw new Error('Failed to complete chat request');
        }
    }

    async streamChatCompletion(request: ChatCompletionRequest): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
        try {
            return await this.client.streamChatCompletion(request);
        } catch (error) {
            console.error('[LLM Controller] Failed streaming chat completion:', error);
            throw new Error('Failed to stream chat request');
        }
    }
}