# PRD Tracking

Status of all PRD documents.

## Batch 1: Telephony + AI Orchestration + Shared
- [x] `prds/telephony/call-flow.md`
- [x] `prds/telephony/media-streaming.md`
- [x] `prds/telephony/session-management.md`
- [x] `prds/telephony/prompts.md`
- [x] `prds/ai-orchestration/supervisor.md`
- [x] `prds/ai-orchestration/conversation-resolver.md`
- [x] `prds/ai-orchestration/post-call-worker.md`
- [x] `prds/shared/clients/openai.md`
- [x] `prds/shared/clients/elevenlabs.md`
- [x] `prds/shared/clients/twilio.md`
- [x] `prds/shared/clients/prisma.md`
- [x] `prds/shared/clients/redis.md`
- [x] `prds/shared/clients/qdrant.md`
- [x] `prds/shared/data/repositories.md`
- [x] `prds/shared/data/stores.md`
- [x] `prds/shared/services/embeddings.md`

## Batch 2: Knowledge Graph + General Persona
- [x] `prds/knowledge-graph/population.md`
- [x] `prds/knowledge-graph/retrieval.md`
- [x] `prds/knowledge-graph/schema.md`
- [x] `prds/personas/general/conversation.md`
- [x] `prds/personas/general/rag-pipeline.md`
- [x] `prds/personas/general/post-call.md`

## Batch 3: Health + Cognitive Persona
- [x] `prds/personas/health.md` (top-level, comprehensive)
- [x] `prds/personas/health/health-check.md` (implementation details)
- [x] `prds/personas/health/post-call.md`
- [x] `prds/personas/cognitive.md` (top-level, referenced by sub-PRDs)
- [x] `prds/personas/cognitive/assessment.md`
- [x] `prds/personas/cognitive/scoring.md`
- [x] `prds/personas/cognitive/baseline-drift.md`
- [x] `prds/personas/cognitive/post-call.md`

## Batch 4: Web
- [ ] `prds/web/back-end.md`
- [ ] `prds/web/front-end.md` (update existing)
- [ ] `prds/web/onboarding.md`

## Batch 5: Scheduler + Infrastructure
- [ ] `prds/scheduler/scheduling.md`
- [ ] `prds/scheduler/queue-processing.md`
- [ ] `prds/infrastructure/docker.md`
- [ ] `prds/infrastructure/database-schema.md`
- [ ] `prds/infrastructure/queues.md`
- [ ] `prds/infrastructure/redis-keys.md`

## Future (superseded — content migrated to proper PRDs)
- `prds/future/cognitive-persona.md` — empty, superseded by `personas/cognitive/assessment.md`
- `prds/future/knowledge-graph.md` — superseded by `knowledge-graph/*.md`
- `prds/future/rag-intergration.md` — empty, superseded by `personas/general/rag-pipeline.md`

## Decisions (ADRs)
- [x] `decisions/adr-001-langgraph.md` (updated with background + LangSmith note)
- [x] `decisions/adr-002-elevenlabs-routing.md`
- [x] `decisions/adr-003-shared-split.md`
- [x] `decisions/adr-004-bullmq-postcall.md`
- [x] `decisions/adr-005-websocket-bridge.md` — why we manage Twilio↔ElevenLabs WSS ourselves (revisit planned)
- [x] `decisions/adr-006-prompt-location.md` — why system prompts live in telephony server
- [x] `decisions/adr-007-shallow-redis-saver.md` — why ShallowRedisSaver over RedisSaver
- [x] `decisions/adr-008-general-persona-migration.md` — migrate general persona to ElevenLabs native LLM + RAG MCP tool (proposed, post-batch)
