import { createClient, RedisClientType } from 'redis';

class RedisClient {
    private static instance: RedisClient;
    private client: RedisClientType;
    private isConnected = false;

    private constructor(url: string) {
        this.client = createClient({
            url
        });
        this.setupEventHandlers();
    }

    static getInstance(): RedisClient {
        if (!RedisClient.instance) {
            const url = process.env.REDIS_URL || 'redis://localhost:6379';
            RedisClient.instance = new RedisClient(url);
        }
        return RedisClient.instance;
    }

    private setupEventHandlers(): void {
        this.client.on('error', (err) => {
            console.error('Redis client error:', err);
            this.isConnected = false;
        });

        this.client.on('connect', () => {
            console.log('Redis connected');
            this.isConnected = true;
        });

        this.client.on('reconnecting', () => {
            console.log('Redis reconnecting...');
        });

        this.client.on('ready', () => {
            console.log('Redis ready');
            this.isConnected = true;
        });
    }

    async connect(): Promise<void> {
        if (!this.isConnected) {
            await this.client.connect();
        }
    }

    async disconnect(): Promise<void> {
        await this.client.quit();
        this.isConnected = false;
    }

    async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
        if (options?.EX) {
            await this.client.setEx(key, options.EX, value);
        } else {
            await this.client.set(key, value);
        }
    }

    async get(key: string): Promise<string | null> {
        return await this.client.get(key);
    }

    async setJSON<T>(key: string, value: T, ttl?: number): Promise<void> {
        const json = JSON.stringify(value);
        if (ttl) {
            await this.client.setEx(key, ttl, json);
        } else {
            await this.client.set(key, json);
        }
    }

    async getJSON<T>(key: string): Promise<T | null> {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
    }

    async getKeysByPattern(pattern: string): Promise<string[]> {
        return await this.client.keys(pattern);
    }

    async deleteByPattern(pattern: string): Promise<number> {
        const keys = await this.client.keys(pattern);
        if (keys.length === 0) return 0;
        return await this.client.del(keys);
    }

    duplicate(): RedisClientType {
        return this.client.duplicate();
    }

    createSubscriber(): RedisClientType {
        return this.client.duplicate();
    }

    getClient(): RedisClientType {
        return this.client;
    }
}

export const redisClient = RedisClient.getInstance();
export { RedisClient };