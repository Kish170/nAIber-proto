# Stores — Test Spec

Reference PRD: [stores.md](../../prds/shared/data/stores.md)

## Unit Tests

### RedisEmbeddingStore

#### Constructor
- Accepts RedisClient and optional key prefix (default: `embed_cache:`)
- Sets LangChain namespace to `['naiber', 'stores']`

#### mget()
- Returns `Uint8Array` for existing keys (decoded from base64)
- Returns `undefined` for missing keys
- Prepends key prefix to each lookup
- Handles mixed results (some found, some missing) in same batch

#### mset()
- Stores each value as base64-encoded string in Redis
- Prepends key prefix to each key
- Sets TTL of 86400s (24hr) on each key
- Handles batch of multiple key-value pairs in parallel

#### mdelete()
- Deletes all specified keys (with prefix) from Redis
- No-ops on empty key array (no Redis call made)
- No error if keys don't exist

#### yieldKeys()
- Yields all keys matching `{prefix}{filter}*` pattern
- Strips key prefix from yielded results (returns clean keys)
- With no filter prefix, yields all keys under the store prefix
- Returns empty iterator when no keys match

## High-Impact Error Scenarios

### Redis unavailable during mget/mset
- Redis throws on get/set operations
- Verify error propagates to `CacheBackedEmbeddings` (caller handles fallback to OpenAI)

### Corrupted base64 data
- `mget()` retrieves non-base64 string from Redis
- Verify behavior (Buffer.from may return garbage bytes — consumer should handle)

## Test Approach
- Mock `RedisClient` (get, set, getClient, getKeysByPattern)
- Verify base64 encoding/decoding roundtrip for embeddings
- Verify key prefix is applied consistently across all operations
- Verify TTL value passed to Redis set calls
