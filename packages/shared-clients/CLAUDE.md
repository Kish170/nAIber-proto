# @naiber/shared-clients
External service connections. Each client is a standalone wrapper around a third-party SDK.

## What It Owns
- `OpenAIClient.ts` — Chat completions, embeddings model, streaming. Also exports `Message`, `ChatCompletionRequest` types.
- `ElevenlabsClient.ts` — Voice conversation API. Exports `CallMessage`, `ElevenLabsConfigs`, `TranscriptMessage` types.
- `TwilioClient.ts` — Phone calls and SMS.
- `PrismaDBClient.ts` — Prisma singleton connection.
- `RedisClient.ts` — Redis singleton with JSON helpers, pattern delete, hash ops.
- `QdrantClient.ts` — Vector database REST client.
- `VectorStoreClient.ts` — LangChain QdrantVectorStore wrapper.

## What It Does NOT Own
- No business logic, no data access patterns, no orchestration.
- Does not own prompt templates (those are in `server/src/prompts/`).

## Environment (consumed by clients at runtime)
- `REDIS_URL` — Redis connection (used by RedisClient)
- `ELEVENLABS_API_KEY` — Used in ElevenlabsClient request headers
- All other env vars (`OPENAI_API_KEY`, `TWILIO_*`, `QDRANT_*`) are passed in via constructor config by the consuming package, not read from env directly.

## Dependencies
- `@naiber/shared-core` (types)
- `openai`, `@langchain/openai`, `@langchain/core`, `@langchain/qdrant`, `axios`, `twilio`, `redis`, `@prisma/client`

## Dependents
- `@naiber/server` (Twilio, ElevenLabs, OpenAI, Redis, Prisma)
- `@naiber/llm-server` (OpenAI, Redis, VectorStore, Twilio, ElevenLabs)
- `@naiber/shared-data` (PrismaDBClient, RedisClient)
- `@naiber/shared-services` (OpenAIClient)

## Gotchas
- `PrismaDBClient.ts` imports from `../../../generated/prisma/index.js` — path is relative to repo root.
- `RedisClient` and `PrismaDBClient` are singletons — do not instantiate multiple times.
- Interface types (`ChatCompletionRequest`, `ElevenLabsConfigs`, etc.) are exported from the client files, not from shared-core.
- `QdrantClient.ts` is technically not needed but keep for now; `VectorStoreClient.ts` is the Vector Store client with Langchain support.
