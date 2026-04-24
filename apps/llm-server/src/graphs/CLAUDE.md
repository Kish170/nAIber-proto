# graphs/
Top-level graph orchestration. Only the SupervisorGraph lives here — persona-specific graphs are in `personas/`.

## Communication
```
ElevenLabs → POST /v1/chat/completions → LLMRoute → SupervisorGraph
  → HealthCheckGraph (health check calls)
  → CognitiveGraph (cognitive calls — placeholder)
  → general_misrouted (defensive node — general calls should not reach llm-server)
  → Response back to ElevenLabs
```

LLMRoute reads `userId` and `conversationId` directly from the ElevenLabs request body (`elevenlabs_extra_body.user_id`, `conversation_id`). SupervisorGraph reads call type from Redis (`session:{conversationId}`).

General calls are handled by ElevenLabs native LLM + MCP tools in `apps/mcp-server`. They do not reach llm-server.

## What It Owns
- `SupervisorGraph.ts` — Routes messages to the correct persona graph based on call type. Manages compiled graph instance for HealthCheckGraph. Accepts a `BaseCheckpointSaver` for health check durable execution.

## What It Does NOT Own
- Persona-specific logic, states, or handlers (those are in `personas/`).
- Post-call processing (that's `workers/PostCallWorker.ts`).
- General call live turns (those are handled by ElevenLabs native LLM + `apps/mcp-server`).

## Dependencies
- `personas/health/HealthCheckGraph.ts`
- `states/SupervisorState.ts`
- `@naiber/shared-clients` (OpenAI, Redis)