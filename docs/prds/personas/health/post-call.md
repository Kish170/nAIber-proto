# Health Check Post-Call

## Purpose
Persists validated health check answers to Postgres after a health check call ends.

## Graph Structure
Single node: `persist_log`

## Behavior
1. Reads `healthCheckAnswers` from checkpoint state (extracted by PostCallWorker from ShallowRedisSaver)
2. Calls `HealthRepository.createHealthCheckLog()` with:
   - `elderlyProfileId` (userId)
   - `conversationId`
   - `answers` (serialized `HealthCheckAnswer[]`)
3. Deletes checkpoint thread from ShallowRedisSaver after persistence

## Input
PostCallWorker extracts from checkpoint state and maps to structured format:
- `{ id, question, category, type, answer, isValid }` per answer
- Invalid answers (`isValid: false`) have `answer: null`
- Defaults to empty array if no answers found

## Current Status
Fully implemented in `HealthPostCallGraph.ts`.

## Related Docs
- [Health Check](../../personas/health.md)
- [Post-Call Worker](../../ai-orchestration/post-call-worker.md)
