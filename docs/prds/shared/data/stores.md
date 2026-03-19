# Stores

## Purpose
Redis-backed stores for caching and ephemeral data that doesn't belong in PostgreSQL.

## RedisEmbeddingStore
- LangChain `BaseStore<string, Uint8Array>` implementation backed by Redis
- Used by `EmbeddingService` for `CacheBackedEmbeddings` — avoids re-embedding the same text
- Cache namespace: `embeddings:v1`
- No TTL — cache persists until Redis is flushed

## Consumers
- Shared services EmbeddingService (cache layer for OpenAI embeddings)

## Current Status
Fully implemented in `packages/shared-data/src/stores/RedisEmbeddingStore.ts`.

## Related Docs
- [Embedding Service](../services/embeddings.md) — uses this store for caching
- [Redis Client](../clients/redis.md) — underlying Redis connection
- [Redis Keys](../../infrastructure/redis-keys.md) — key pattern reference
