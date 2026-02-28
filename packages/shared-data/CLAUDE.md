# @naiber/shared-data
Repositories (Prisma data access) and stores (Redis caching).

## What It Owns
- `repositories/UserRepository.ts` — User profile queries with full includes (conditions, medications, topics, summaries).
- `repositories/ConversationRepository.ts` — Conversation CRUD, summaries, topics, messages. Defines `Summary`, `TranscriptMessage` interfaces locally.
- `repositories/HealthRepository.ts` — Health conditions, medications, health/medication/condition log creation. Defines `HealthCheckLogData`, `MedicationLogData`, `HealthConditionLogData` interfaces locally.
- `stores/RedisEmbeddingStore.ts` — LangChain `BaseStore` implementation backed by Redis for embedding caching.

## What It Does NOT Own
- No business logic or orchestration — repositories are pure data access.
- Does not define database schema — that's Prisma's job (`prisma/schema.prisma`).

## Dependencies
- `@naiber/shared-core` (types — `UserProfileData`, `userProfileInclude`)
- `@naiber/shared-clients` (`prismaClient`, `RedisClient`)
- `@langchain/core` (for `BaseStore` in RedisEmbeddingStore)

## Dependents
- `@naiber/server` (system prompts for personas use UserRepository)
- `@naiber/llm-server` (persona graphs use ConversationRepository, HealthRepository; LLMRoute uses RedisEmbeddingStore)
