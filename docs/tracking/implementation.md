# Implementation Tracking

Outstanding implementation work across the codebase.

## Telephony
- [x] ~~Implement CognitivePrompt.ts~~ (already fully implemented)
- [ ] Rename `server` → `telephony-server` (package.json, docker-compose, imports, tsconfig refs)
- [x] ~~Remove `rag:phone:{phone}` Redis key — only needed by insecure fallback~~
- [x] ~~Remove regex extraction fallbacks from ConversationResolver (userId + phone from system prompt)~~
- [x] ~~Keep only primary resolution path: `llm.user_id` → `rag:user:{userId}` → `session:{conversationId}`~~
- [ ] Improve general call end-call mechanism (health/cognitive have programmatic termination via `scheduleCallEnd()`, general calls do not)

## AI Orchestration
- [x] ~~Cognitive post-call bug: scores stored on `this` instead of LangGraph state channels (Phase 5A)~~ — fixed

## General Persona
- [ ] RAG retrieval quality — responses use generic context from current conversation rather than prior memory. Revisit after ADR-008 migration (general persona → native LLM + RAG MCP tool) since the retrieval architecture will change.
- [ ] Indirect cognitive signal extraction during general conversation calls (Phase 5C)
  - `IndirectSignalExtractor` — vocabulary diversity, repetition markers, response latency, sentence complexity, topic coherence
  - New `IndirectCognitiveSignal` Prisma model
  - New node in `GeneralPostCallGraph` after summarization

## Knowledge Graph
- [x] ~~NER person deduplication — NERService used random UUIDs, causing duplicate Person nodes across calls. Fixed with deterministic hash IDs.~~
- [x] ~~Neo4j database name — Neo4jClient targeted `nAIber-KG` which doesn't exist in Community Edition. Fixed to use default `neo4j` database.~~
- [ ] End-to-end KG pipeline validation (Phase 4)

## Cognitive Assessment
- [ ] Drift notifications — create Notification record on notable/significant drift
- [ ] Distress detection → SMS emergency contact via Twilio

## Notification System
- [ ] Caregiver notification delivery (in-app + email/SMS)
- [ ] Notification types: missed calls, health concerns, weekly summaries, medication reminders, system failures
- [ ] Mark-as-read, dismiss, unread count (repository exists, no frontend wiring yet)
- [ ] Notification triggers from cognitive drift, health check flags, missed calls

## Web API
- [ ] Elderly user update/preferences endpoint
- [ ] Caregiver invitation flow backend (send invite, accept/reject)

## Web Frontend
- [ ] Welcome step 2 — data submission (needs elderly user update endpoint)
- [ ] "Update observations" button — form/modal to create new submissions
- [ ] "Invite another caregiver" dialog functionality

## Code Quality
- [ ] Improve naming conventions across the codebase (variables, functions, files, packages)
- [ ] Migrate from console.log/error to structured logging (pino or winston) with log levels and JSON output
- [ ] Centralized log collection (Datadog, Grafana Loki, or similar) for production observability
- [ ] Call tracing — correlate logs across server → ElevenLabs → llm-server using callSid/conversationId

## Documentation
- [ ] Migrate `docs/prds/future/` content into proper PRD files, then delete the directory

## Scheduler
- [ ] QueuePopulator implementation (empty scaffold)
- [ ] QueueProcessor implementation (empty scaffold)

## Post-Batch: Telephony Migration (after all batches, before deployment)
- [ ] Build MCP server exposing tools: registerSession, getUserProfile, dispatchPostCall, getCallType
- [ ] Migrate to ElevenLabs built-in Twilio integration (`POST /v1/convai/twilio/outbound-call`)
- [ ] Use `conversation_config_override` for per-call prompt/first message injection
- [ ] Update test specs and tests for new architecture
- [ ] See [ADR-005](../decisions/adr-005-websocket-bridge.md) for full context

## Post-Batch: General Persona Migration (after all batches, before deployment)
- [ ] Migrate general persona to ElevenLabs native LLM (remove ConversationGraph for general calls)
- [ ] Expose RAG as MCP tool: `retrieveMemories(query)` → Qdrant + KG enriched results
- [ ] Route general calls to ElevenLabs native LLM (no `llm.url` override)
- [ ] Route health/cognitive calls to llm-server via `llm.url` in `conversation_config_override`
- [ ] Decide on topic tracking approach: post-call only vs `trackTopic` MCP tool
- [ ] Verify MCP tool call latency is acceptable for conversational flow
- [ ] Remove ConversationGraph, IntentClassifier, general call path from SupervisorGraph
- [ ] GeneralPostCallGraph unchanged — still processes transcripts after call
- [ ] See [ADR-008](../decisions/adr-008-general-persona-migration.md) for full context
