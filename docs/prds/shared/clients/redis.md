# Redis Client

## Purpose
Singleton Redis client with JSON helpers, pattern operations, and hash support.

## Key Behaviors
- `get()` / `set()` — basic key-value with optional TTL
- `getJSON()` / `setJSON()` — JSON serialize/deserialize with optional TTL
- `deleteByPattern()` — delete keys matching a glob pattern
- `getKeysByPattern()` — list keys matching a glob pattern
- Hash operations for structured data
- `connect()` / `disconnect()` — lifecycle management
- Singleton pattern via `getInstance()`
- Connection URL from `REDIS_URL` env var (default `redis://localhost:6379`)

## Note
The telephony server has its own local Redis client instance (`apps/server/src/clients/RedisClient.ts`), separate from the shared singleton. Both connect to the same Redis instance.

## Consumers
- Telephony server (session management, call type storage)
- llm-server (conversation resolver, topic state, KG cache)
- shared-data (RedisEmbeddingStore)

## Current Status
Fully implemented in `packages/shared-clients/src/RedisClient.ts`.

## Related Docs
- [Redis Keys](../../infrastructure/redis-keys.md) — full key pattern reference
- [Session Management](../../telephony/session-management.md) — primary consumer
- [Stores](../data/stores.md) — RedisEmbeddingStore built on this client
