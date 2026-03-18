# Testing Tracking

Status of test spec documents and actual test implementations.

## Test Spec Documents (docs/tests/)

### Batch 1
- [ ] `tests/telephony/call-flow.test.md`
- [ ] `tests/telephony/media-streaming.test.md`
- [ ] `tests/telephony/session-management.test.md`
- [ ] `tests/telephony/prompts.test.md`
- [ ] `tests/ai-orchestration/supervisor.test.md`
- [ ] `tests/ai-orchestration/conversation-resolver.test.md`
- [ ] `tests/ai-orchestration/post-call-worker.test.md`
- [ ] `tests/shared/clients/clients.test.md`
- [ ] `tests/shared/data/repositories.test.md`
- [ ] `tests/shared/data/stores.test.md`
- [ ] `tests/shared/services/embeddings.test.md`

### Batch 2
- [ ] `tests/knowledge-graph/population.test.md`
- [ ] `tests/knowledge-graph/retrieval.test.md`
- [ ] `tests/knowledge-graph/schema.test.md`
- [ ] `tests/personas/general/conversation.test.md`
- [ ] `tests/personas/general/rag-pipeline.test.md`
- [ ] `tests/personas/general/post-call.test.md`

### Batch 3
- [ ] `tests/personas/health/health-check.test.md`
- [ ] `tests/personas/health/post-call.test.md`
- [ ] `tests/personas/cognitive/assessment.test.md`
- [ ] `tests/personas/cognitive/scoring.test.md`
- [ ] `tests/personas/cognitive/baseline-drift.test.md`
- [ ] `tests/personas/cognitive/post-call.test.md`

### Batch 4
- [ ] `tests/web/back-end.test.md`
- [ ] `tests/web/front-end.test.md`
- [ ] `tests/web/onboarding.test.md`

### Batch 5
- [ ] `tests/scheduler/scheduling.test.md`
- [ ] `tests/scheduler/queue-processing.test.md`
- [ ] `tests/infrastructure/docker.test.md`
- [ ] `tests/infrastructure/redis-keys.test.md`
- [ ] `tests/infrastructure/database-schema.test.md`
- [ ] `tests/infrastructure/queues.test.md`

## Test Framework Setup
- [ ] Install vitest + @vitest/coverage-v8
- [ ] Root vitest.config.ts with workspace config
- [ ] Per-package test configs

## Test Implementation
- [ ] Synthetic test data / fixtures
- [ ] shared-data: repository integration tests
- [ ] llm-server: scoring engine, task validators, graph traversal unit tests
- [ ] KG: integration tests against test Neo4j
- [ ] apps/api: tRPC router tests
