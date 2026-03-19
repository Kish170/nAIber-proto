# OpenAI Client

## Purpose
Wrapper around the OpenAI SDK providing chat completions, streaming, and embedding model access.

## Key Behaviors
- `generalGPTCall()` — single-shot chat completion
- `streamChatCompletion()` — streaming chat completion (SSE)
- `returnChatModel()` — returns LangChain `ChatOpenAI` instance for use in graphs
- `returnEmbeddingModel()` — returns LangChain `OpenAIEmbeddings` instance
- Config passed via constructor (`apiKey`, `baseUrl`)

## Consumers
- Telephony server (dynamic first message generation in prompts)
- llm-server (graph nodes, NER, post-call summary, scoring)
- Shared services (EmbeddingService)

## Current Status
Fully implemented in `packages/shared-clients/src/OpenAIClient.ts`.

## Related Docs
- [Embedding Service](../services/embeddings.md) — uses the embedding model
- [ADR-003: Shared Split](../../decisions/adr-003-shared-split.md) — why clients are in a separate package
