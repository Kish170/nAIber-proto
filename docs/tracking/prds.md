# PRD Tracking

Status of all PRD documents.

## Batch 1: Telephony + AI Orchestration + Shared
- [ ] `prds/telephony/call-flow.md`
- [ ] `prds/telephony/media-streaming.md`
- [ ] `prds/telephony/session-management.md`
- [ ] `prds/telephony/prompts.md`
- [ ] `prds/ai-orchestration/supervisor.md`
- [ ] `prds/ai-orchestration/conversation-resolver.md`
- [ ] `prds/ai-orchestration/post-call-worker.md`
- [ ] `prds/shared/clients/openai.md`
- [ ] `prds/shared/clients/elevenlabs.md`
- [ ] `prds/shared/clients/twilio.md`
- [ ] `prds/shared/clients/prisma.md`
- [ ] `prds/shared/clients/redis.md`
- [ ] `prds/shared/clients/qdrant.md`
- [ ] `prds/shared/data/repositories.md`
- [ ] `prds/shared/data/stores.md`
- [ ] `prds/shared/services/embeddings.md`

## Batch 2: Knowledge Graph + General Persona
- [ ] `prds/knowledge-graph/population.md`
- [ ] `prds/knowledge-graph/retrieval.md`
- [ ] `prds/knowledge-graph/schema.md`
- [ ] `prds/personas/general/conversation.md`
- [ ] `prds/personas/general/rag-pipeline.md`
- [ ] `prds/personas/general/post-call.md`

## Batch 3: Health + Cognitive Persona
- [ ] `prds/personas/health/health-check.md` (update existing `personas/health.md`)
- [ ] `prds/personas/health/post-call.md`
- [ ] `prds/personas/cognitive/assessment.md` (update existing `personas/cognitive.md`)
- [ ] `prds/personas/cognitive/scoring.md`
- [ ] `prds/personas/cognitive/baseline-drift.md`
- [ ] `prds/personas/cognitive/post-call.md`

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

## Decisions (ADRs)
- [x] `decisions/adr-001-langgraph.md` (updated with background + LangSmith note)
- [x] `decisions/adr-002-elevenlabs-routing.md`
- [x] `decisions/adr-003-shared-split.md`
- [x] `decisions/adr-004-bullmq-postcall.md`
- [x] `decisions/adr-005-websocket-bridge.md` — why we manage Twilio↔ElevenLabs WSS ourselves (revisit planned)
- [x] `decisions/adr-006-prompt-location.md` — why system prompts live in telephony server
- [x] `decisions/adr-007-shallow-redis-saver.md` — why ShallowRedisSaver over RedisSaver
