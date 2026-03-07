# @naiber/shared-data
Repositories (Prisma data access) and stores (Redis caching).

## What It Owns
- `repositories/UserRepository.ts` — Elderly profile queries with full includes (conditions, medications, topics, summaries).
- `repositories/ConversationRepository.ts` — Conversation CRUD, summaries, topics. Defines `Summary`, `CallLogData`, `ConversationTopicData`, `ConversationReferenceData` interfaces.
- `repositories/HealthRepository.ts` — Health conditions, medications, health check log creation. Defines `HealthCheckLogData` interface.
- `repositories/CaregiverRepository.ts` — Caregiver profile CRUD and managed users queries.
- `repositories/CaregiverUserLinkRepository.ts` — Caregiver-elderly user link management.
- `repositories/CallLogRepository.ts` — Call log queries with pagination and stats.
- `repositories/NotificationRepository.ts` — Notification CRUD and unread count.
- `repositories/CognitiveRepository.ts` — Cognitive test results, baselines, session counts.
- `repositories/TrustedContactRepository.ts` — Trusted contacts and IQCODE submissions.
- `stores/RedisEmbeddingStore.ts` — LangChain `BaseStore` implementation backed by Redis for embedding caching.

## What It Does NOT Own
- No business logic or orchestration — repositories are pure data access.
- Does not define database schema — that's Prisma's job (`prisma/schema.prisma`).

## Dependencies
- `@naiber/shared-core` (types — `ElderlyProfileData`, `elderlyProfileInclude`, `CaregiverProfileData`, etc.)
- `@naiber/shared-clients` (`prismaClient`, `RedisClient`)
- `@langchain/core` (for `BaseStore` in RedisEmbeddingStore)

## Dependents
- `@naiber/server` (system prompts for personas use UserRepository)
- `@naiber/llm-server` (persona graphs use ConversationRepository, HealthRepository, CognitiveRepository; LLMRoute uses RedisEmbeddingStore)

## Reference Docs
- `docs/arch/shared.md` — shared packages architecture: what this layer owns, dependency direction, gotchas
- `docs/decisions/adr-003-shared-split.md` — why shared code is split into 4 layered packages
