# @naiber/llm-server
LangGraph AI orchestration — SupervisorGraph routes incoming messages to persona-specific graphs. Runs on port 3001.

## Communication
- **Receives:** `POST /v1/chat/completions` from ElevenLabs (OpenAI-compatible format). ElevenLabs calls this endpoint directly — server does NOT proxy.
- **Consumes:** BullMQ `post-call-processing` jobs dispatched by server's PostCallQueue.
- **Calls out to:** OpenAI API (chat + embeddings), Qdrant (vector search), Neo4j (knowledge graph), Twilio (end-call scheduling).
- **Exposes:** `GET /admin/queues` (Bull Board dashboard), `GET /status` (health check).

## Request Lifecycle
1. **Message arrives** — ElevenLabs sends `POST /v1/chat/completions` with conversation messages.
2. **Context resolved** — `ConversationResolver` looks up Redis (`rag:user:{userId}`) to find active conversation context.
3. **Routing** — `SupervisorGraph` determines call type, dispatches to `ConversationGraph` (general) or `HealthCheckGraph` (health).
4. **RAG + KG retrieval** — `ConversationGraph.retrieveMemories` queries Qdrant for vector-similar highlights, then `KGRetrievalService` enriches results via Neo4j (topic traversal, related topics, persons) and discovers additional highlights via Postgres topic bridge. Results are reranked (weighted linear) and cached in Redis.
5. **Response** — Graph returns response, LLMRoute sends it back to ElevenLabs as SSE stream.
5. **Health check completion** — When health check finishes, `scheduleCallEnd()` tells Twilio to hang up after 5s delay.
6. **Post-call** — `PostCallWorker` picks up BullMQ job. General: runs topic extraction + RAG embedding + KG population (nodes then relationships). Health: reads checkpoint answers, persists to DB, deletes thread.

## Environment
- `LLM_PORT` — Server port (default 3001)
- `OPENAI_API_KEY`, `OPENAI_BASE_URL` — LLM provider
- `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` — Vector database
- `REDIS_URL` — Redis connection (default `redis://localhost:6379`)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER` — For end-call scheduling
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_BASE_URL`, `ELEVENLABS_NUMBER_ID` — For PostCallWorker's ElevenLabs client
- `RAG_ENABLED` — Toggle RAG feature (default true, set `'false'` to disable)
- `RAG_MEMORY_SIMILARITY_THRESHOLD` — Cosine similarity threshold (default 0.45)
- `NEO4J_URI` — Neo4j bolt URI (default `bolt://neo4j:7687`)
- `NEO4J_USERNAME` — Neo4j username (default `neo4j`)
- `NEO4J_PASSWORD` — Neo4j password

## What It Owns
- `graphs/SupervisorGraph.ts` — Top-level router. Decides which persona graph handles a message.
- `personas/` — Persona-specific graphs, states, handlers (see subdirectory CLAUDE.md files).
- `services/` — LLM-specific services (IntentClassifier, ConversationResolver, MemoryRetriever, TopicManager, HealthDataService, KGRetrievalService).
- `services/graph/` — KG-specific services: `NERService` (person extraction from transcript), `KGPopulationService` (node + relationship creation via GraphRepository).
- `clients/` — Server-local clients: `VectorStoreClient` (Qdrant via LangChain), `Neo4jClient` (singleton Neo4j driver).
- `repositories/GraphRepository.ts` — Neo4j Cypher operations for all KG node merges and relationship upserts (write-side).
- `repositories/GraphQueryRepository.ts` — Neo4j Cypher read queries for KG retrieval (per-method sessions).
- `workers/PostCallWorker.ts` — BullMQ consumer. Processes post-call jobs dispatched by server.
- `routes/LLMRoute.ts` — `POST /v1/chat/completions` (OpenAI-compatible). ElevenLabs sends messages here.

## What It Does NOT Own
- No telephony, no WebSocket session management (that's `server`).
- No system prompts (those are in `server/src/prompts/`).
- No shared types or clients (those are in `shared-*` packages).

## Dependencies
- `@naiber/shared-core` (queue contracts)
- `@naiber/shared-clients` (OpenAI, Redis, VectorStore, Twilio, ElevenLabs clients)
- `@naiber/shared-data` (ConversationRepository, HealthRepository, RedisEmbeddingStore)
- `@naiber/shared-services` (EmbeddingService)
- `@langchain/langgraph`, `@langchain/langgraph-checkpoint`, `@langchain/langgraph-checkpoint-redis`
- `bullmq`, `express`, `compromise`, `compute-cosine-similarity`, `neo4j-driver`

## Key Patterns
- LangGraph `StateGraph` uses `graph: any` + `setEntryPoint()` to avoid TS strict type issues.
- Health check and cognitive graphs use durable execution: `FixedShallowRedisSaver` checkpointer with interrupt/resume. Thread IDs: `health_check:{userId}:{conversationId}`, `cognitive:{userId}:{conversationId}`.
- `FixedShallowRedisSaver` wraps `ShallowRedisSaver` to fix an async durability race condition (ADR-009). All checkpointer ops are serialized through a single promise chain.
- PostCallWorker reads checkpoint state for health answers, then deletes the thread after persistence.

## Gotchas
- `@langchain/langgraph-checkpoint` must be `^1.0.0` (not `^1.0.1`).
- Use `FixedShallowRedisSaver` (not `ShallowRedisSaver`) for all checkpointers — see ADR-009.
- Bull Board dashboard at `/admin/queues` for queue monitoring.
- PostCallWorker concurrency is 1, rate limited to 3 jobs per 60s.
- Health check call-end has a 5s delay via `scheduleCallEnd()` in LLMRoute.

## Reference Docs
- `docs/arch/llm-server.md` — deep dive on this package: SupervisorGraph, ConversationGraph RAG pipeline, HealthCheckGraph durable execution, PostCallWorker
- `docs/arch/overview.md` — full system context and how llm-server fits into the end-to-end flow
- `docs/personas/general.md` — general conversation persona requirements (RAG behaviour, memory intent, edge cases)
- `docs/personas/health.md` — health check persona requirements (question flow, validation rules, post-call expectations)
- `docs/personas/cognitive.md` — cognitive assessment design spec (read before implementing CognitiveGraph)
- `docs/decisions/adr-001-langgraph.md` — why LangGraph and the graph: any + setEntryPoint() convention
- `docs/decisions/adr-002-elevenlabs-routing.md` — why ElevenLabs calls this server directly
- `docs/decisions/adr-004-bullmq-postcall.md` — why BullMQ and PostCallWorker design constraints