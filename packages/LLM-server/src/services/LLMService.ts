import { OpenAIClient } from "@naiber/shared";

export interface Message {
    role: string;
    content: string;
}

export interface ChatCompletionRequest {
    messages: Message[];
    model: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    user_id?: string;
}

export class LLMService {
    private client: OpenAIClient;
    private request: ChatCompletionRequest

    constructor(request: ChatCompletionRequest) {
        const apiKey = process.env.OPENAI_API_KEY;
        const baseUrl = process.env.OPENAI_BASE_URL;
        if (!apiKey || !baseUrl) {
            throw new Error('Missing required OpenAI environment variables');
        }
        this.client = new OpenAIClient({
            apiKey,
            baseUrl
        })
        this.request = request;
    }

    async chatCompletion() {
        
    }
}