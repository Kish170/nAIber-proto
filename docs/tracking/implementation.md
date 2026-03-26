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

## Health Persona — Build Now
- [ ] Structured health post-call — uncomment `saveHealthLog()`, `saveMedicationLogs()`, `saveHealthConditionLogs()` in HealthCheckHandler; expand HealthPostCallGraph to 4-node graph (parse → persist → analyze → alerts)
- [ ] PHQ-2 depression screen — 2 scale questions (0-3) every health call; score ≥ 3 triggers full GDS-15 next call; results shared to cognitive via Redis signal
- [ ] IADL questions — 4 boolean questions (medication mgmt, financial mgmt, transportation, meal prep) every health call
- [ ] Cognitive self-report questions — 3 questions (forgetfulness, word-finding, repetition) every health call
- [ ] New Prisma models: HealthLog, MedicationLog, HealthConditionLog, IADLAssessment

## Health Persona — Build Next
- [ ] Full GDS-15 with trigger logic — 15 yes/no items, administered when PHQ-2 score ≥ 3
- [ ] Health trend analysis — `HealthTrendAnalyzer.ts` (wellbeing trajectory, sleep trajectory, medication adherence, IADL decline, symptom recurrence, GDS trajectory)
- [ ] ElderlyProfile schema expansion — sensory impairments, primary language, living situation

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

## Cognitive Assessment — Build Now
- [ ] Demographic-adjusted scoring — `DemographicAdjustment.ts` modifies interpretation thresholds using education/age from ElderlyProfile (Rossetti 2011, Borland 2017 normative data)
- [ ] Baseline initialization from onboarding — `BaselineInitializer.ts` converts IQCODE informant data into prior expectations, blends with first test (0.6 test + 0.4 priors)
- [ ] Assessment confidence scoring — `ConfidenceScoring.ts` produces 0-1 meta-score per session (completion rate, retries, hearing difficulty, illness, medication changes). Add `confidenceScore`/`confidenceFactors` to CognitiveTestResult schema
- [ ] Health-to-cognitive confounding flags — read Redis health signals before scoring; downgrade drift category when confounders present

## Cognitive Assessment — Build Next
- [ ] MCID/RCI-based drift detection — `ReliableChangeDetector.ts` validates score changes exceed measurement error (`z = (X2 - X1) / sqrt(2 * SEM²)`)
- [ ] Personal norms scoring — after 5+ sessions, per-domain personal bests/variance/stable-period means become primary drift input
- [ ] Wellbeing gate confounding expansion — add acute illness, medication change, hearing difficulty questions to pre-test screening
- [ ] Drift notifications — create Notification record on notable/significant drift
- [ ] Distress detection → SMS emergency contact via Twilio

## Cognitive Assessment — Later
- [ ] Adaptive testing / supplementary probes — optional domain-specific probes after standard battery based on decline patterns (max 3-5 min)
- [ ] Indirect speech signal extraction (Phase 5C) — type-token ratio, MLU, repetition markers, filler density, self-corrections from transcript
- [ ] Extended content rotation — additional word lists/digit sequences for increased testing frequency
- [ ] Acoustic/prosodic analysis — requires audio pipeline, not just transcript

## Cross-Persona — Build Now
- [ ] Redis signal sharing — health→cognitive and cognitive→health signals with 30-day TTL (mood, sleep, IADL, medication, drift)

## Cross-Persona — Build Next
- [ ] Unified escalation framework — `EscalationService.ts` with 4 tiers (Log → Dashboard → Alert → SMS) based on signal severity
- [ ] New NotificationType values: `COGNITIVE_DRIFT`, `MOOD_CONCERN`, `IADL_DECLINE`

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
