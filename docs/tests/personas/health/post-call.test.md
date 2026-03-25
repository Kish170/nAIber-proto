# Health Post-Call — Test Spec

Reference PRD: [post-call.md](../../../prds/personas/health/post-call.md)

## Layer 1: E2E Smoke
- After health check call + post-call: HealthCheckLog exists in Postgres
- Answers array is non-empty
- Checkpoint thread deleted from Redis

## Layer 2: Integration Tests

### Answer Extraction (PostCallWorker)
- Reads checkpoint state from ShallowRedisSaver using thread ID `health_check:{userId}:{conversationId}`
- Maps raw `healthCheckAnswers` to structured format: `{ id, question, category, type, answer, isValid }`
- Sets `answer: null` for invalid answers (`isValid: false`)
- Defaults to empty array when no answers in checkpoint state

### Persistence (HealthPostCallGraph)
- Creates HealthCheckLog with correct `elderlyProfileId` and `conversationId`
- Stores full answers array as JSON
- Handles empty answers array (creates log with empty answers)

### Thread Cleanup
- Checkpoint thread deleted after successful persistence
- Thread NOT deleted if persistence fails (allows retry)

### Error Cases
- Missing checkpoint state: returns `{ success: false }` (no crash)
- Database persistence failure: error recorded, thread preserved for retry

## Test Approach
- Seed checkpoint state with known health check answers
- Invoke PostCallWorker.processHealthCheckJob()
- Verify HealthCheckLog in Postgres, thread deletion in Redis