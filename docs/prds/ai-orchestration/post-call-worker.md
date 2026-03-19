# Post-Call Worker

## Purpose
BullMQ consumer that processes post-call jobs after a call ends. Routes to the correct persona-specific post-call graph based on call type.

## Key Behaviors
- Consumes `post-call-processing` queue (produced by telephony server's `PostCallQueue`)
- Routes by `callType`:
  - `general` → `GeneralPostCallGraph` (transcript, summary, topics, embeddings, NER, KG population)
  - `health_check` → reads checkpoint answers from `ShallowRedisSaver`, invokes `HealthPostCallGraph`, deletes thread
  - `cognitive` → reads checkpoint state (task responses, wellbeing, flags), invokes `CognitivePostCallGraph`, deletes thread
- Cleans up `rag:topic:{conversationId}` Redis key after every job

## Worker Configuration
- Concurrency: 1
- Rate limit: 3 jobs per 60 seconds
- Retry: 3 attempts with exponential backoff
- Deduplication: by conversationId (5-min TTL, set by producer)

## Dependencies
- BullMQ (`@naiber/shared-core` queue contracts)
- `ShallowRedisSaver` checkpointer (reading health/cognitive thread state)
- GeneralPostCallGraph, HealthPostCallGraph, CognitivePostCallGraph
- OpenAI, ElevenLabs, EmbeddingService, VectorStoreClient (injected into graphs)

## Current Status
Fully implemented in `apps/llm-server/src/workers/PostCallWorker.ts`.

## Related Docs
- [ADR-004: BullMQ Post-Call](../../decisions/adr-004-bullmq-postcall.md) — why BullMQ for post-call processing
- [General Post-Call](../personas/general/post-call.md) — general conversation post-call pipeline
- [BullMQ Queues](../infrastructure/queues.md) — queue contracts and configuration
