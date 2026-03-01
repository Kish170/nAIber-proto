# Glossary

Key terms, acronyms, and concepts used across the nAIber-proto project. Serves as a reference for developers, contributors, and Claude Code to maintain consistent understanding of system terminology.

---

## Critical Disambiguation

Three terms are easy to conflate but refer to distinct concepts:

| Term | Owned by | Identifier | Lifetime |
|---|---|---|---|
| **Session** | `@naiber/server` | `conversationId` (key: `session:{conversationId}`) | Duration of active call, 1h Redis TTL |
| **Conversation** | ElevenLabs | `conversationId` | ElevenLabs' concept — the voice interaction instance |
| **Thread** | `@naiber/llm-server` (LangGraph) | `health_check:{userId}:{conversationId}` | Health check only — durable checkpoint in Redis |

A **session** is `server`'s Redis record of an active call. A **conversation** is the ElevenLabs concept that generates the `conversationId`. A **thread** is the LangGraph checkpoint used by `HealthCheckGraph` for durable execution. They share the same `conversationId` as a correlation key, but are separate data structures in separate systems.

---

## A–Z

### Assessment, Cognitive
See **Cognitive Assessment**.

### Baseline (Cognitive)
A per-user reference vector of communication and cognitive metrics established during onboarding. Captures the user's typical speech rate, pause patterns, lexical diversity, semantic coherence, and cognitive task performance. All future **indirect assessment** deviation scores are computed relative to this baseline. The baseline evolves over time via weighted moving average as more direct test data is collected. Stored in Postgres (`cognitive_baselines` table). See `docs/personas/cognitive.md`.

### BullMQ
A Redis-backed job queue library used for post-call processing. `@naiber/server` is the producer; `@naiber/llm-server`'s `PostCallWorker` is the consumer. Used because post-call operations (summarization, embeddings, DB writes) are slow and failure-prone — jobs are persisted to Redis, retried on failure, and monitored via Bull Board (`/admin/queues`). Chosen over direct async processing because it survives process restarts. See `docs/decisions/adr-004-bullmq-postcall.md`.

### callSid
Twilio's unique identifier for a phone call. Created when `CallController.createCall()` dials the user. Used as a key prefix in Redis (`call_type:{callSid}`) to pass the call type from the call initiation phase to the WebSocket handler before `conversationId` is known.

### Call Type
One of three values: `'general'`, `'health_check'`, `'cognitive'`. Determines which persona graph `SupervisorGraph` routes to. Set at call initiation (`POST /call`) and stored in Redis at `call_type:{callSid}` (60s TTL) and `session:{conversationId}` (1h TTL).

### Caregiver
A stakeholder — typically a family member or professional carer — who has access to the user's health and cognitive assessment data via the dashboard. Distinct from the **trusted contact** (who provides qualitative input during cognitive baseline onboarding).

### Checkpointer
A LangGraph component that persists graph state to an external store between turns. nAIber uses `ShallowRedisSaver` from `@langchain/langgraph-checkpoint-redis/shallow`. Used exclusively by `HealthCheckGraph` (and future `CognitiveGraph`) for **durable execution**. The checkpointer is initialized in `llm-server/src/index.ts` and injected as a dependency through `LLMRoute` → `SupervisorGraph` → `HealthCheckGraph`. Pinned to `@langchain/langgraph-checkpoint@^1.0.0`. See **Thread**.

### Cognitive Assessment
A two-tiered persona for tracking cognitive function over time. **Direct assessment**: a structured call type that tests memory, attention, fluency, and reasoning to establish and update a per-user **baseline**. **Indirect assessment**: passive linguistic and acoustic analysis of general calls, compared to the baseline to detect drift. Currently a placeholder in the codebase (`CognitiveGraph`, `CognitivePrompt` exist but contain no logic). See `docs/personas/cognitive.md`.

### Command (LangGraph)
A LangGraph construct used to resume an interrupted graph with an input value. In `HealthCheckGraph`, when a user answers a health check question, `SupervisorGraph` wraps the answer in a `Command({ resume: userAnswer })` and passes it to the graph to continue execution from the `wait_for_answer` interrupt point. Part of the **interrupt/resume** pattern.

### Companion Persona
See **General Call**.

### Conversation
The ElevenLabs ConvAI concept for a voice interaction session. ElevenLabs assigns a `conversationId` when a session is initiated and sends it to `server` via the `conversation_initiation_metadata` event. This `conversationId` is the primary correlation key across the system — used in Redis session keys, LangGraph thread IDs, BullMQ job data, and database records. See **Critical Disambiguation**.

### ConversationGraph
The LangGraph `StateGraph` for general calls. Implements the RAG pipeline: classify intent → manage topic state → retrieve memories → generate response. Skips RAG for non-substantive messages via the **intent classifier**. Lives in `llm-server/src/personas/general/ConversationGraph.ts`. See `docs/arch/llm-server.md`.

### ConversationId
ElevenLabs-assigned unique identifier for a voice conversation. Received during the `conversation_initiation_metadata` WebSocket event. Used as the primary correlation key across all services — Redis session keys, LangGraph thread IDs, BullMQ job payloads, and Postgres records all reference this ID.

### ConversationResolver
Service in `llm-server` that maps an incoming ElevenLabs `POST /v1/chat/completions` request to a Redis session. Extracts `userId` or `phone` from the request (system message or metadata), then looks up `rag:user:{userId}` or `rag:phone:{phone}` in Redis to find the active `conversationId`. If resolution fails, falls back to the generic `LLMController`. Lives in `llm-server/src/services/ConversationResolver.ts`.

### cosine similarity
The similarity metric used throughout the RAG pipeline and cognitive signal analysis. Measures the angle between two embedding vectors — a score of 1.0 is identical, 0.0 is orthogonal. Used by `TopicManager` to detect topic shifts (default threshold: 0.45) and by `MemoryRetriever` to score memory relevance against a query. See **topic centroid**.

### Direct Assessment
The structured cognitive test tier. A dedicated call type that explicitly measures cognitive performance across defined domains (attention, working memory, semantic fluency, language comprehension, reasoning). Produces domain scores that form the user's **baseline**. Contrast with **indirect assessment**. See `docs/personas/cognitive.md`.

### Durable Execution
The pattern used by `HealthCheckGraph` (and future `CognitiveGraph`) to persist graph state across multiple HTTP requests. Because each ElevenLabs turn is a separate `POST /v1/chat/completions` call, in-memory state does not survive between turns. The **checkpointer** writes graph state to Redis after each node execution, and the graph resumes from the last checkpoint on the next turn via the **interrupt/resume** pattern.

### ElevenLabs ConvAI
The voice AI platform used for speech synthesis and turn-taking during calls. `@naiber/server` establishes a WebSocket session with ElevenLabs, injects the system prompt and first message, and bridges audio between Twilio and ElevenLabs. ElevenLabs calls `llm-server:3001/v1/chat/completions` directly for each conversation turn — it is both the audio layer and the LLM request initiator. See `docs/decisions/adr-002-elevenlabs-routing.md`.

### Embedding
A numerical vector representation of text, generated by OpenAI's embeddings model. Used for: semantic memory storage in Qdrant (general call RAG), topic change detection in `TopicManager`, and cognitive signal analysis (semantic coherence in indirect assessment). Preprocessing via `TextPreprocessor` (in `@naiber/shared-services`) is applied before embedding to reduce noise.

### ESM (ECMAScript Modules)
The module system used throughout the monorepo. All packages have `"type": "module"` in `package.json`. A critical convention: all internal TypeScript imports must use `.js` extensions (e.g. `import { Foo } from './Foo.js'`), which TypeScript resolves to `.ts` at compile time but the emitted JS requires at runtime. Violating this causes runtime import errors.

### General Call
The default call type. An unstructured, open-ended companion conversation. The AI acts as an active listener, builds on past interactions via RAG memory, and aims to foster a sense of ongoing relationship. Routes to `ConversationGraph` via `SupervisorGraph`. See `docs/personas/general.md`.

### Health Check
A structured call type that asks a fixed set of health questions, validates answers, and persists results to Postgres. Uses **durable execution** (interrupt/resume with Redis **checkpointer**) to maintain question state across turns. Routes to `HealthCheckGraph` via `SupervisorGraph`. See `docs/personas/health.md`.

### HealthCheckGraph
The LangGraph `StateGraph` for health check calls. Implements a durable Q&A loop: orchestrator → ask question → interrupt → validate answer → retry or advance → finalize. Uses `ShallowRedisSaver` for checkpoint persistence. Thread ID: `health_check:{userId}:{conversationId}`. Lives in `llm-server/src/personas/health/HealthCheckGraph.ts`. See **Thread** and `docs/arch/llm-server.md`.

### Indirect Assessment
The passive cognitive monitoring tier. Runs post-call on every general conversation call as part of `GeneralPostCallGraph`. Extracts linguistic signals (speech rate, lexical diversity, semantic coherence, filler frequency) and acoustic signals (pause distribution, pitch variance) from the call transcript and audio. Deviation scores are computed against the user's **baseline** and stored in Postgres (`cognitive_signals` table). Contrast with **direct assessment**. See `docs/personas/cognitive.md`.

### Intent Classifier
A service in `llm-server` (`services/IntentClassifier.ts`) that decides whether a user's message warrants RAG processing. Short, filler, or non-substantive messages ("yeah", "ok", "that's nice") are flagged to skip the RAG path in `ConversationGraph`. Prevents unnecessary vector searches on low-signal turns.

### Interrupt / Resume
The LangGraph pattern used by `HealthCheckGraph` for durable multi-turn execution. The graph pauses at the `wait_for_answer` node (interrupt), returns the current question to ElevenLabs, and waits. On the next turn, `SupervisorGraph` detects an interrupted thread and resumes it via `Command({ resume: userAnswer })`, passing the user's response back into the graph. See **Durable Execution** and **Command**.

### LangGraph
A graph-based AI orchestration framework from LangChain. Used in `llm-server` to model persona-specific conversation flows as directed graphs with typed state. Chosen for its native support for **durable execution** (checkpointer + interrupt/resume) and composable node model. Each persona is a `StateGraph`. See `docs/decisions/adr-001-langgraph.md`.

### Memory Retriever
Service in `llm-server` (`services/MemoryRetriever.ts`) that performs vector similarity search against Qdrant to retrieve relevant past conversation memories. Called by `ConversationGraph` when a topic shift is detected or the topic cache is stale. Returns top-N memories (default: 5) above the cosine similarity threshold (default: 0.45).

### Monorepo
The project is structured as an npm workspace monorepo. All packages live under `packages/`. Build order is strictly enforced: `shared-core → shared-clients → shared-data → shared-services → server / llm-server`. Run `npm run build` from the repo root.

### Persona
One of three AI interaction modes — general (companion), health check, or cognitive assessment. Each persona has its own LangGraph graph, state definition, handler, prompt, and post-call flow. Routed by `SupervisorGraph` based on `callType`. See **Call Type**.

### Post-Call Processing
Work that runs after a call ends, dispatched as a BullMQ job by `@naiber/server` and consumed by `PostCallWorker` in `@naiber/llm-server`. For general calls: summarization, topic extraction, embedding upsert. For health checks: checkpoint state read, answer persistence to DB, thread deletion. Runs with a 3-second delay to allow ElevenLabs to finalize the transcript.

### PostCallQueue
The BullMQ producer in `@naiber/server` (`queues/PostCallQueue.ts`). Dispatches `post-call-processing` jobs after each call ends. Deduplicates by `conversationId` with a 5-minute in-memory TTL. Job schema (`PostCallJobData`) defined in `@naiber/shared-core/types/queue-contracts.ts`.

### PostCallWorker
The BullMQ consumer in `@naiber/llm-server` (`workers/PostCallWorker.ts`). Processes `post-call-processing` jobs. Concurrency: 1. Rate limit: 3 jobs/60s. Branches on `callType` to run either `GeneralPostCallGraph` or `HealthPostCallGraph`.

### Prisma
The ORM used for all Postgres access. Schema lives at `prisma/schema.prisma` in the repo root. Types are generated to `generated/prisma/` and imported by `@naiber/shared-core`. The `PrismaDBClient` in `@naiber/shared-clients` is a singleton — do not instantiate multiple times.

### Prompt (System Prompt)
The instructions injected into an ElevenLabs session at call start that define the AI's persona, tone, constraints, and first message. All prompts live in `@naiber/server/src/prompts/` and are passed directly over the ElevenLabs WebSocket. They must not be moved to `llm-server`. Base class: `PromptInterface`. Subclasses: `GeneralPrompt`, `HealthPrompt`, `CognitivePrompt` (placeholder).

### Qdrant
A vector database used to store and retrieve conversation memory embeddings for the RAG pipeline. `VectorStoreClient` (a LangChain `QdrantVectorStore` wrapper in `@naiber/shared-clients`) is the active client. Used by `MemoryRetriever` for semantic search during general calls, and by `GeneralPostCallGraph` for embedding upsert post-call.

### Queue Contract
The shared definition of a BullMQ job's data shape. All queue contracts are defined in `@naiber/shared-core/types/queue-contracts.ts` — the single source of truth. Never define job schemas locally in producer or consumer packages. Currently: `PostCallJobData` and `POST_CALL_QUEUE_NAME`.

### RAG (Retrieval-Augmented Generation)
The memory retrieval pattern used in general calls. Before generating a response, the system retrieves semantically relevant past conversation memories from Qdrant and injects them into the LLM's context. Enables the AI to reference past interactions and feel like an ongoing relationship. Controlled by `RAG_ENABLED` env var. See `docs/arch/llm-server.md`.

### Redis
In-memory key-value store used for three distinct purposes in this system: (1) active call **session** storage, (2) LangGraph **checkpointer** state for health check durable execution, and (3) **BullMQ** job queue backend. A Redis outage affects all three simultaneously. Default URL: `redis://localhost:6379`.

### Session
`server`'s Redis record of an active call. Keyed at `session:{conversationId}`. Contains `{ callSid, userId, phone, streamSid, startedAt, callType }`. 1-hour TTL. Created by `SessionManager` when ElevenLabs sends `conversation_initiation_metadata`. Deleted post-call by `SessionManager.deleteSession()`. Consumed by `ConversationResolver` in `llm-server`. See **Critical Disambiguation**.

### SessionManager
Service in `@naiber/server` (`services/SessionManager.ts`) responsible for creating, reading, and deleting active call sessions in Redis. Writes three keys on session creation: `session:{conversationId}`, `rag:user:{userId}`, `rag:phone:{phone}`.

### shared-clients
`@naiber/shared-clients` — the external service connections layer. Contains standalone client wrappers for OpenAI, ElevenLabs, Twilio, Prisma, Redis, and Qdrant. No business logic. Depends on `shared-core` only.

### shared-core
`@naiber/shared-core` — the types-only foundation layer. Contains Prisma-derived types and BullMQ queue contracts. Zero runtime code. Every other package depends on this.

### shared-data
`@naiber/shared-data` — the data access layer. Contains repositories (`UserRepository`, `ConversationRepository`, `HealthRepository`) and `RedisEmbeddingStore`. No business logic — pure data access. Depends on `shared-core` and `shared-clients`.

### shared-services
`@naiber/shared-services` — the business logic utilities layer. Contains `EmbeddingService` (cache-backed OpenAI embeddings) and `TextPreprocessor` (NLP text cleanup via `compromise`). Depends on `shared-core`, `shared-clients`. Only consumed by `llm-server`.

### Stability Index
A composite cognitive metric — the average normalized deviation score across all tracked indirect assessment signals for a given call. A score near zero indicates communication patterns close to the user's **baseline**. Used as a high-level summary on the dashboard.

### streamSid
Twilio's identifier for the audio media stream associated with a call. Distinct from **callSid** (the call) and **conversationId** (the ElevenLabs conversation). Used by `WebSocketService` to mark audio responses back to the correct Twilio stream.

### SupervisorGraph
The top-level LangGraph `StateGraph` in `llm-server`. Reads `callType` from the Redis session and routes to the appropriate persona graph — `ConversationGraph` (general), `HealthCheckGraph` (health check), or `CognitiveGraph` (cognitive, placeholder). Does not make an LLM call for routing — `callType` is already known from the session. Lives in `llm-server/src/graphs/SupervisorGraph.ts`. See `docs/arch/llm-server.md`.

### TextPreprocessor
Utility in `@naiber/shared-services` that cleans and normalizes text before embedding. Removes filler words, extracts key terms, and reduces noise using `compromise` NLP. Single source of truth for text cleanup — no duplicate preprocessing logic should exist elsewhere in the codebase.

### Thread
A LangGraph checkpoint thread — a uniquely identified sequence of graph state snapshots persisted to Redis by the **checkpointer**. Used by `HealthCheckGraph` to maintain question state across turns. Thread ID format: `health_check:{userId}:{conversationId}`. Distinct from a Redis **session** (which is `server`'s call record) and a **conversation** (which is ElevenLabs' concept). See **Critical Disambiguation** and **Durable Execution**.

### Topic Centroid
A vector (embedding) representing the current topic of a conversation. Stored in Redis at `rag:topic:{conversationId}`. `TopicManager` computes a new embedding for each user message and compares it to the centroid via cosine similarity. A score below the threshold (default: 0.45) signals a topic shift and triggers a fresh Qdrant memory search.

### TopicManager
Service in `llm-server` (`services/TopicManager.ts`) that detects topic changes during general calls. Maintains a running topic centroid and memory highlights cache in Redis. A detected topic shift causes `ConversationGraph` to run a fresh `MemoryRetriever` vector search.

### Trusted Contact
A person nominated by a user during cognitive assessment onboarding. They provide qualitative observations about the user's typical communication and alertness patterns, which are stored as part of the user's **baseline**. Also notified when the baseline drift detection determines a revalidation is needed.

### Twilio
The telephony platform. `@naiber/server` uses Twilio to place outbound calls, receive TwiML callbacks, and stream bidirectional audio via WebSocket. The `callSid` is Twilio's call identifier. `WebSocketService` bridges Twilio's audio stream to ElevenLabs.

### UserProfile
A class in `@naiber/server/src/handlers/UserHandler.ts` that loads and shapes user data for prompt generation. Populated via `UserRepository` from Postgres. Key fields used in prompts: name, age, gender, interests, dislikes, `isFirstCall`, `lastCallAt`, last conversation summary.

### Vector Store
The Qdrant-backed store for conversation memory embeddings. Accessed via `VectorStoreClient` (`@naiber/shared-clients`), a LangChain `QdrantVectorStore` wrapper. Used for storing post-call memory embeddings (general calls) and retrieving relevant memories during RAG.

### WebSocketService
The core service in `@naiber/server` (`services/WebSocketService.ts`) that manages the full call lifecycle — bridging Twilio and ElevenLabs audio, handling session registration, injecting prompts, and triggering post-call workflow. Manages the WebSocket keepalive to ElevenLabs (every 30s) and the 3-second post-call dispatch delay.
