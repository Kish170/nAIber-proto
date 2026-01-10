import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { AIMessageChunk } from "@langchain/core/messages";
import { z } from "zod";

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
    private chatModel: ChatOpenAI
    private embeddingModel: OpenAIEmbeddings

    constructor(config: OpenAIConfigs) {
        this.chatModel = new ChatOpenAI({
            apiKey: config.apiKey,
            configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
            model: "gpt-4o",
            temperature: 0.7,
            maxRetries: 3
        });

        this.embeddingModel = new OpenAIEmbeddings({
            apiKey: config.apiKey,
            configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
            model: "text-embedding-3-small",
        });
    }

    async generalGPTCall(request: ChatCompletionRequest): Promise<OpenAI.Chat.Completions.ChatCompletion> {
        try {
            const messages = request.messages.map(msg => {
                if (msg.role === 'system') return ['system', msg.content];
                if (msg.role === 'user') return ['human', msg.content];
                if (msg.role === 'assistant') return ['assistant', msg.content];
                return ['human', msg.content];
            }) as [string, string][];

            let content: string;

            if (request.response_format?.type === 'json_object') {
                const jsonSchema = z.object({}).passthrough();
                const structuredModel = this.chatModel.withStructuredOutput(jsonSchema);
                const prompt = ChatPromptTemplate.fromMessages(messages);
                const result = await prompt.pipe(structuredModel).invoke({});
                content = JSON.stringify(result);
            } else {
                const prompt = ChatPromptTemplate.fromMessages(messages);
                const aiMessage = await prompt.pipe(this.chatModel).invoke({});
                content = aiMessage.content as string;
            }

            return {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: request.model ?? 'gpt-4o',
                choices: [{
                    index: 0,
                    message: { role: 'assistant', content, refusal: "false" },
                    finish_reason: 'stop',
                    logprobs: null
                }],
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            };

        } catch (error) {
            console.error('[OpenAI] Failed general task:', error);
            throw new Error('[OpenAI] Call to api with general prompt failed');
        }
    }

    async streamChatCompletion(request: ChatCompletionRequest): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
        try {
            const messages = request.messages.map(msg => {
                if (msg.role === 'system') return ['system', msg.content];
                if (msg.role === 'user') return ['human', msg.content];
                if (msg.role === 'assistant') return ['assistant', msg.content];
                return ['human', msg.content];
            }) as [string, string][];
            
            const prompt = ChatPromptTemplate.fromMessages(messages);
            const stream = await prompt.pipe(this.chatModel).stream({});

            return this.mapToOpenAIStream(stream, request) as any;
        } catch (error) {
            console.error('[OpenAI] Failed to create stream:', error);
            throw new Error('[OpenAI] Call to api with streaming prompt failed');
        }
    }

    async generateEmbeddings(text: string): Promise<number[]> {
        try {
            return await this.embeddingModel.embedQuery(text)
        } catch (error) {
            console.error('[OpenAI] Failed to create embedding:', error);
            throw new Error('[OpenAI] Call to api for embedding failed');
        }
    }

    private async *mapToOpenAIStream(langchainStream: AsyncIterable<AIMessageChunk>, request: ChatCompletionRequest): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
        let index = 0;
        const created = Math.floor(Date.now() / 1000);
        const id = `chatcmpl-${Date.now()}`;

        for await (const chunk of langchainStream) {
            yield {
                id,
                object: 'chat.completion.chunk',
                created,
                model: request.model ?? 'gpt-4o',
                choices: [{
                    index: 0,
                    delta: {
                        role: index === 0 ? 'assistant' : undefined,
                        content: chunk.content as string
                    },
                    finish_reason: null,
                    logprobs: null
                }]
            };
            index++;
        }

        yield {
            id,
            object: 'chat.completion.chunk',
            created,
            model: request.model ?? 'gpt-4o',
            choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop',
                logprobs: null
            }]
        };
    }
}