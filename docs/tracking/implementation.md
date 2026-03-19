# Implementation Tracking

Outstanding implementation work across the codebase.

## Telephony
- [ ] Implement CognitivePrompt.ts (placeholder — no substantive content)
- [ ] Rename `server` → `telephony-server` (package.json, docker-compose, imports, tsconfig refs)
- [ ] Remove `rag:phone:{phone}` Redis key — only needed by insecure fallback
- [ ] Remove regex extraction fallbacks from ConversationResolver (userId + phone from system prompt)
- [ ] Keep only primary resolution path: `llm.user_id` → `rag:user:{userId}` → `session:{conversationId}`
- [ ] Improve general call end-call mechanism (health/cognitive have programmatic termination via `scheduleCallEnd()`, general calls do not)

## AI Orchestration
- [ ] Cognitive post-call bug: scores stored on `this` instead of LangGraph state channels (Phase 5A)

## General Persona
- [ ] Indirect cognitive signal extraction during general conversation calls (Phase 5C)
  - `IndirectSignalExtractor` — vocabulary diversity, repetition markers, response latency, sentence complexity, topic coherence
  - New `IndirectCognitiveSignal` Prisma model
  - New node in `GeneralPostCallGraph` after summarization

## Knowledge Graph
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
