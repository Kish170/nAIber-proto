# @naiber/shared-services
Business logic utilities shared across server packages.

## What It Owns
- `EmbeddingService.ts` — Cache-backed embeddings using OpenAI + LangChain `CacheBackedEmbeddings`. Handles text preprocessing before embedding.
- `TextPreprocessor.ts` — Single source of truth for text cleanup. Uses `compromise` NLP for key term extraction, filler word removal, semantic essence. No duplicate copies should exist elsewhere.

## What It Does NOT Own
- No external service connections (those are in `shared-clients`).
- No data access (that's `shared-data`).
- `UserHandler` was moved to `server/src/handlers/` — it's server-only.

## Dependencies
- `@naiber/shared-core` (types)
- `@naiber/shared-clients` (OpenAIClient for embeddings)
- `@langchain/community`, `@langchain/core` (CacheBackedEmbeddings)
- `compromise` (NLP for TextPreprocessor)

## Dependents
- `@naiber/llm-server` (uses `EmbeddingService` in graphs, workers, and LLMRoute)

## Reference Docs
- `docs/arch/shared.md` — shared packages architecture: what this layer owns, dependency direction, gotchas
- `docs/decisions/adr-003-shared-split.md` — why shared code is split into 4 layered packages
