# Testing Tracking

Status of test spec documents and actual test implementations.

See [Testing Strategy](../tests/testing-strategy.md) for the 3-layer approach.

## Test Spec Documents (docs/tests/)

### Batch 1 (AI Orchestration — specs complete)
- [x] `tests/ai-orchestration/supervisor.test.md`
- [x] `tests/ai-orchestration/conversation-resolver.test.md`
- [x] `tests/ai-orchestration/post-call-worker.test.md`

### Batch 2 (Knowledge Graph + General Persona — specs complete)
- [x] `tests/knowledge-graph/population.test.md`
- [x] `tests/knowledge-graph/retrieval.test.md`
- [x] `tests/knowledge-graph/schema.test.md`
- [x] `tests/personas/general/conversation.test.md`
- [x] `tests/personas/general/rag-pipeline.test.md`
- [x] `tests/personas/general/post-call.test.md`

### Batch 3 (Health + Cognitive Persona — specs complete)
- [x] `tests/personas/health/health-check.test.md`
- [x] `tests/personas/health/post-call.test.md`
- [x] `tests/personas/cognitive/assessment.test.md`
- [x] `tests/personas/cognitive/scoring.test.md`
- [x] `tests/personas/cognitive/baseline-drift.test.md`
- [x] `tests/personas/cognitive/post-call.test.md`

### Deferred (until after MCP migration)
- [ ] `tests/telephony/call-flow.test.md`
- [ ] `tests/telephony/media-streaming.test.md`
- [ ] `tests/telephony/session-management.test.md`
- [ ] `tests/telephony/prompts.test.md`
- [ ] `tests/shared/clients/clients.test.md`
- [ ] `tests/shared/data/repositories.test.md`
- [ ] `tests/shared/data/stores.test.md`
- [ ] `tests/shared/services/embeddings.test.md`
- [ ] `tests/web/back-end.test.md`
- [ ] `tests/web/front-end.test.md`
- [ ] `tests/web/onboarding.test.md`
- [ ] `tests/scheduler/scheduling.test.md`
- [ ] `tests/scheduler/queue-processing.test.md`
- [ ] `tests/infrastructure/docker.test.md`
- [ ] `tests/infrastructure/redis-keys.test.md`
- [ ] `tests/infrastructure/database-schema.test.md`
- [ ] `tests/infrastructure/queues.test.md`

## Test Framework Setup
- [x] LangSmith integration — `LANGCHAIN_TRACING_V2=true` configured in llm-server
- [ ] Install vitest + @vitest/coverage-v8
- [ ] Root vitest.config.ts with workspace config
- [ ] Per-package test configs (llm-server)

## Layer 1: E2E Smoke Test
- [x] `scripts/text-test.ts` — existing, covers all 3 call types
- [ ] Add post-call verification to scripted mode
- [ ] Expand general scenario (more messages, topic shifts)

### Per-Persona Run Status
- [x] Health — ran `health-full.json` + `health-early-exit.json`; fixed `resolvedTo` IDs on medications/conditions, fixed system prompt issue
- [x] Cognitive — ran `cognitive-full.json` (17 messages); FixedShallowRedisSaver (ADR-009); unified graph loop with single interrupt node; fixed content rotation bug; fixed prompt context bleed (`slice(-4)` → last message only + stronger task directives) (2026-03-27)
- [ ] General — not yet run

### Cognitive — Outstanding Issues
- [ ] **Retry limits**: multi-turn tasks (digit span, word registration, abstraction) have no max retry cap — add configurable limit per task type, record as partial after limit
- [ ] **Skip functionality**: if user can't do a task (e.g. "I can't do that one"), graph should skip to next task and mark as skipped — will be handled via MCP tools
- [ ] **TaskValidation accuracy for voice**: digit span uses `match(/\d/g)` which fails on speech-to-text word-form numbers ("five eight two"); vigilance only validates self-reported count (no real-time per-letter tracking); word registration/recall depends on STT accuracy for specific words — revisit validation for voice robustness
- [ ] **ElevenLabs turn detection**: cognitive tasks (word reading, digit reading, letter vigilance) need interruption disabled or reduced so AI can finish speaking sequences — configure via ElevenLabs UI agent settings
- [ ] **Test scenario session dependency**: `cognitive-full.json` assumes session index 0 — CognitiveTestResult rows must be cleared for the test user before running, otherwise content rotation mismatch causes failures

## Layer 2: Integration Tests (Implementation)
- [ ] Vitest setup in llm-server
- [ ] KG schema: GraphRepository + GraphQueryRepository tests
- [ ] KG population: KGPopulationService tests
- [ ] KG retrieval: KGRetrievalService tests (two-stream, merge, rerank)
- [ ] General: ConversationGraph node traversal, intent classification
- [ ] General post-call: GeneralPostCallGraph (summary, topics, embeddings, NER, KG)
- [ ] Health: HealthCheckGraph durable Q&A flow, validation
- [ ] Health post-call: HealthPostCallGraph persistence
- [ ] Cognitive: CognitiveGraph task battery, content rotation
- [ ] Cognitive scoring: TaskValidation per task type, ScoringEngine
- [ ] Cognitive baseline/drift: EWMA, drift categories
- [ ] Cognitive post-call: CognitivePostCallGraph (scores, persist, baseline, drift)

## Layer 3: LangSmith (Observability)
- [x] Tracing enabled — traces visible in dashboard
- [ ] Create saved views for: general call flow, health Q&A, cognitive battery
- [ ] Monitor RAG attribution (source field in enrichedMemories)
