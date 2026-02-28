# graphs/
Top-level graph orchestration. Only the SupervisorGraph lives here — persona-specific graphs are in `personas/`.

## Communication
```
ElevenLabs → POST /v1/chat/completions → LLMRoute → SupervisorGraph
  → ConversationGraph (general calls)
  → HealthCheckGraph (health check calls)
  → Response back to ElevenLabs
```

SupervisorGraph determines call type from Redis (`call_type:{callSid}`) resolved by ConversationResolver, then delegates to the appropriate persona graph.

## What It Owns
- `SupervisorGraph.ts` — Routes messages to the correct persona graph based on call type. Manages compiled graph instances for ConversationGraph (general) and HealthCheckGraph (health). Accepts a `BaseCheckpointSaver` for health check durable execution.

## What It Does NOT Own
- Persona-specific logic, states, or handlers (those are in `personas/`).
- Post-call processing (that's `workers/PostCallWorker.ts`).

## Dependencies
- `personas/general/ConversationGraph.ts`
- `personas/health/HealthCheckGraph.ts`
- `states/SupervisorState.ts`
- `services/MemoryRetriever`, `services/TopicManager`
- `@naiber/shared-clients` (OpenAI, Redis), `@naiber/shared-services` (EmbeddingService)