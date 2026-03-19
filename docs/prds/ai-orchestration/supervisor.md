# SupervisorGraph

## Purpose
Top-level LangGraph router that determines call type and dispatches messages to the correct persona graph.

## Key Behaviors
- Reads call type from Redis session (`session:{conversationId}`)
- Routes to one of three persona graphs: `ConversationGraph` (general), `HealthCheckGraph` (health), `CognitiveGraph` (cognitive)
- For health/cognitive: manages durable execution — detects new vs interrupted vs completed threads, handles resume via `Command` pattern
- Returns persona graph response + completion flags (`isHealthCheckComplete`, `isCognitiveComplete`)

## Graph Structure
```
supervisor → [conditional routing]
  → general_call → END
  → health_check → END
  → cognitive_call → END
```

## Durable Execution (Health + Cognitive)
- Thread IDs: `health_check:{userId}:{conversationId}`, `cognitive:{userId}:{conversationId}`
- New thread: invoke graph with initial state
- Interrupted thread: resume with `Command({ resume: userAnswer })`
- Completed thread: return completion message

## Dependencies
- ConversationGraph, HealthCheckGraph, CognitiveGraph
- Redis client (session lookup for call type)
- `ShallowRedisSaver` checkpointer (health + cognitive durable execution)
- OpenAI client, EmbeddingService, MemoryRetriever, TopicManager, KGRetrievalService (injected into ConversationGraph)

## Current Status
Fully implemented in `apps/llm-server/src/graphs/SupervisorGraph.ts`.

## Related Docs
- [ADR-001: LangGraph](../../decisions/adr-001-langgraph.md) — why we use graph-based orchestration
- [Conversation Resolver](./conversation-resolver.md) — resolves which conversation a request belongs to
- [Post-Call Worker](./post-call-worker.md) — processes jobs after calls end
