# Post-Call Worker — Test Spec

Reference PRD: [post-call-worker.md](../../prds/ai-orchestration/post-call-worker.md)

## Unit Tests

### Constructor
- Creates BullMQ Worker on `post-call-processing` queue
- Sets concurrency to 1
- Sets rate limit: 3 jobs per 60s
- Initializes all three post-call graphs (general, health, cognitive)
- Registers event handlers for `completed`, `failed`, `error`

### processJob() — routing
- Routes `callType: 'general'` to `generalPostCallGraph.invoke()`
- Routes `callType: 'health_check'` to `processHealthCheckJob()`
- Routes `callType: 'cognitive'` to `processCognitiveJob()`
- Cleans up `rag:topic:{conversationId}` Redis key in `finally` block regardless of outcome
- Topic cleanup failure is non-fatal (logged as warning, doesn't throw)

### General post-call
- Invokes `GeneralPostCallGraph` with `conversationId`, `userId`, `isFirstCall`, `callType`, empty transcript
- Throws if graph returns `errors` array with entries
- Returns `{ success, conversationId, topicsCreated, topicsUpdated }` on success
- Defaults topic counts to 0 when not present in result

### processHealthCheckJob()
- Reads checkpoint state from `ShallowRedisSaver` using thread ID `health_check:{userId}:{conversationId}`
- Extracts `healthCheckAnswers` from checkpoint channel values
- Maps raw answers to structured format: `{ id, question, category, type, answer, isValid }`
- Sets `answer` to `null` for invalid answers (`isValid: false`)
- Defaults to empty array when no answers found
- Invokes `HealthPostCallGraph` with `{ userId, conversationId, answers }`
- Throws if graph returns `error`
- Deletes thread from checkpointer after successful processing
- Returns `{ success, conversationId, answersRecorded }`

### processCognitiveJob()
- Reads checkpoint state from `ShallowRedisSaver` using thread ID `cognitive:{userId}:{conversationId}`
- Returns `{ success: false }` if no checkpoint state found
- Extracts full cognitive state: `taskResponses`, `wellbeingResponses`, `sessionIndex`, content selection fields, `distressDetected`, `isPartial`, `isDeferred`, `deferralReason`
- Defaults all fields to safe values when missing from checkpoint
- Invokes `CognitivePostCallGraph` with extracted state
- Throws if graph returns `error`
- Deletes thread from checkpointer after successful processing
- Returns `{ success, conversationId, isDeferred, isPartial, taskResponseCount }`

### close()
- Calls `worker.close()` to shut down the BullMQ worker

## High-Impact Error Scenarios

### Graph invoke fails
- Any post-call graph throws during `invoke()`
- Verify error is re-thrown (BullMQ handles retry with exponential backoff)
- Verify `rag:topic:{conversationId}` cleanup still happens (finally block)

### Checkpoint state missing for health/cognitive
- `getTuple()` returns null or empty channel values
- Health: defaults to empty answers array, graph receives empty input
- Cognitive: returns `{ success: false }` without invoking graph

### Thread deletion fails after processing
- `checkpointer.deleteThread()` throws
- Verify processing result is still valid (thread cleanup is post-success)
- Thread may remain in Redis but will expire naturally

## Test Approach
- Mock `ShallowRedisSaver` (getTuple, deleteThread)
- Mock all three compiled post-call graphs (invoke)
- Mock `RedisClient` (deleteByPattern for topic cleanup)
- Create test `PostCallJobData` for each call type
- Verify checkpoint read format matches what health/cognitive graphs produce
