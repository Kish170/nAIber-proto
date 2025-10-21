import axios, { AxiosInstance } from 'axios';

export interface QdrantConfig {
    baseUrl: string;
    api_key: string;
}

export interface ConversationPoint {
    id: string;
    vector: number;
    payload: {
        userId: string;
        conversationId: string;
        highlight: string;
        topics: string;
        mood: string;
        conversationDate: string; 
        timestamp: number;
        highlightIndex: number;
    };
}

export interface QueryParams {
    userId: string;
    query: string, 
    limit?: number
}

export interface CollectionPutResult {
    success: boolean;
    highlightsStored: number;
}

// add response interface

export class QdrantClient {
    private client: AxiosInstance;
    private config: QdrantConfig
    private collectionName: string

    constructor(config: QdrantConfig) {
        this.config = config;
        this.client = axios.create({
            baseURL: config.baseUrl,
            headers: this.getQdrantHeaders()
        });
        this.collectionName = 'naiber-conversations';
    }

    private getQdrantHeaders() {
        return {
            'Content-Type': 'application/json',
            'api-key': this.config.api_key
        };
    }

    // async postToCollection(points: ConversationPoint[]) {
    //     const response = await this.client.put(`/collections/${this.collectionName}/points`, { points });
    //     return 
    // }

    // async searchCollection(params: QueryParams) {
    //     const {userId, query, limit} = params;

    //     if (!userId || query) {
    //         throw new Error('userId and query are required parameters');
    //     }

    //     return this.client.
    // }

}