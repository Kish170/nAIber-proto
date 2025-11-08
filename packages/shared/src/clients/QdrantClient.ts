import axios, { AxiosInstance } from 'axios';

export interface QdrantConfig {
    baseUrl: string;
    apiKey: string;
    collectionName: string;
}

export interface ConversationPoint {
    id: string;
    vector: number[];
    payload: {
        userId: string;
        conversationId: string;
        highlight: string;
    };
}

export interface QueryParams {
    userId: string;
    queryEmbedding: number[];
    limit?: number;
}

export interface CollectionPutResult {
    success: boolean;
    highlightsStored: number;
}

export interface SearchPayload {
    highlight: string;
    topics: string[];
    mood: string;
    data: string;
    similarity: number;
}

export class QdrantClient {
    private client: AxiosInstance;
    private config: QdrantConfig
    private initializationPromise: Promise<boolean> | null = null;

    constructor(config: QdrantConfig) {
        this.config = config;
        this.client = axios.create({
            baseURL: config.baseUrl,
            headers: this.getQdrantHeaders()
        });    }

    private async ensureCollectionExists(): Promise<boolean> {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.getOrInitializeCollection();
        return this.initializationPromise;
    }

    private async getOrInitializeCollection(): Promise<boolean> {
        try {
            const response = await this.client.get(`/collections/${this.config.collectionName}`);
            return response.data.result.status === "green";
        } catch (error) {
            return this.initializeCollection();
        }
    }

    private async initializeCollection(): Promise<boolean> {
        try {
            const response = await this.client.put(`/collections/${this.config.collectionName}`, {
                vectors: {
                    size: 1536,
                    distance: "Cosine"
                }
            });
            return response.data.result === true || response.status === 200;
        } catch (error) {
            console.error('[QdrantClient] Error initializing collection:', error);
            return false;
        }
    }

    private getQdrantHeaders() {
        return {
            'Content-Type': 'application/json',
            'api-key': this.config.apiKey
        };
    }

    async postToCollection(points: ConversationPoint[]): Promise<CollectionPutResult> {
        try {
            if (!points || points.length === 0) {
                throw new Error('points array is required and must not be empty');
            }

            await this.ensureCollectionExists();

            const response = await this.client.put(`/collections/${this.config.collectionName}/points`, { points });

            return {
                success: response.status === 200,
                highlightsStored: points.length
            };
        } catch (error) {
            console.error('[QdrantClient] Error posting to collection:', error);
            return {
                success: false,
                highlightsStored: 0
            };
        }
    }

    async searchCollection(params: QueryParams): Promise<SearchPayload[]> {
        try {
            const {userId, queryEmbedding, limit} = params;

            if (!userId || !queryEmbedding) {
                throw new Error('userId and queryEmbedding are required parameters');
            }

            await this.ensureCollectionExists();

            const response = await this.client.post(`/collections/${this.config.collectionName}/points/search`, {
                vector: queryEmbedding,
                filter: {
                    must: [{ key: 'userId', match: { value: userId } }]
                },
                limit: limit || 5,
                with_payload: true
            });

            if (!response.data || !Array.isArray(response.data.result)) {
                console.warn('[QdrantClient] Unexpected response format from search');
                return [];
            }

            return response.data.result.map((result: any) => {
                const payload = result.payload ?? {};
                return {
                    highlight: payload.highlight ?? '',
                    topics: Array.isArray(payload.topics)
                        ? payload.topics
                        : (typeof payload.topics === 'string' ? payload.topics.split(', ') : []),
                    mood: payload.mood ?? '',
                    data: payload.conversationDate ?? '',
                    similarity: result.score ?? 0
                };
            });

        } catch (error) {
            console.error('[QdrantClient] Error searching collection:', error);
            return [];
        }
    }

}