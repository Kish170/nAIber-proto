import { BaseStore } from '@langchain/core/stores';
import { RedisClient } from '../clients/RedisClient.js';

const EMBEDDING_TTL_SECONDS = 86400;

export class RedisEmbeddingStore extends BaseStore<string, Uint8Array> {
    lc_namespace = ['naiber', 'stores'];
    private redisClient: RedisClient;
    private keyPrefix: string;

    constructor(redisClient: RedisClient, keyPrefix: string = 'embed_cache:') {
        super();
        this.redisClient = redisClient;
        this.keyPrefix = keyPrefix;
    }

    private prefixedKey(key: string): string {
        return `${this.keyPrefix}${key}`;
    }

    async mget(keys: string[]): Promise<(Uint8Array | undefined)[]> {
        return Promise.all(
            keys.map(async (key) => {
                const val = await this.redisClient.get(this.prefixedKey(key));
                if (val === null) return undefined;
                return new Uint8Array(Buffer.from(val, 'base64'));
            })
        );
    }

    async mset(keyValuePairs: [string, Uint8Array][]): Promise<void> {
        await Promise.all(
            keyValuePairs.map(([key, value]) =>
                this.redisClient.set(
                    this.prefixedKey(key),
                    Buffer.from(value).toString('base64'),
                    { EX: EMBEDDING_TTL_SECONDS }
                )
            )
        );
    }

    async mdelete(keys: string[]): Promise<void> {
        const prefixedKeys = keys.map(k => this.prefixedKey(k));
        if (prefixedKeys.length > 0) {
            await this.redisClient.getClient().del(prefixedKeys);
        }
    }

    async *yieldKeys(prefix?: string): AsyncGenerator<string> {
        const pattern = `${this.keyPrefix}${prefix ?? ''}*`;
        const keys = await this.redisClient.getKeysByPattern(pattern);
        for (const key of keys) {
            yield key.slice(this.keyPrefix.length);
        }
    }
}