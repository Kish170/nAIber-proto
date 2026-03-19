# Embedding Service

## Purpose
Cache-backed text embedding generation with NLP preprocessing. Single source of truth for embedding text across the system.

## Key Behaviors
- `generateEmbedding(text)` — preprocesses text then generates OpenAI embedding, cached in Redis
- `generateEmbeddings(texts[])` — batch embedding generation
- `embedQuery()` / `embedDocuments()` — LangChain-compatible interface
- Text preprocessing via `TextPreprocessor` — uses compromise NLP to extract semantic essence (nouns, verbs, proper nouns), removes stop words and filler

## Caching
- Uses `CacheBackedEmbeddings` from LangChain backed by `RedisEmbeddingStore`
- Cache namespace: `embeddings:v1`
- Identical text inputs return cached embeddings without hitting OpenAI API

## Consumers
- llm-server TopicManager (topic centroid embedding)
- llm-server ConversationGraph (message embedding for topic detection)
- llm-server GeneralPostCallGraph (highlight embedding for Qdrant storage)

## Current Status
Fully implemented in `packages/shared-services/src/EmbeddingService.ts` and `packages/shared-services/src/TextPreprocessor.ts`.

## Related Docs
- [Stores](../data/stores.md) — RedisEmbeddingStore cache backend
- [RAG Pipeline](../../personas/general/rag-pipeline.md) — primary consumer of embeddings
- [OpenAI Client](../clients/openai.md) — provides embedding model
