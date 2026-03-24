# SupervisorGraph — Test Spec

Reference PRD: [supervisor.md](../../prds/ai-orchestration/supervisor.md)

## Unit Tests

### Constructor
- Compiles ConversationGraph, HealthCheckGraph, CognitiveGraph
- Builds state graph with nodes: `supervisor`, `general_call`, `health_check`, `cognitive_call`
- Sets entry point to `supervisor`
- Adds conditional routing from `supervisor` and terminal edges to `END`

### supervisor() (routing node)
- Reads session from Redis at `session:{conversationId}`
- Returns `callType` from session data
- Defaults to `'general'` if session not found or `callType` missing

### route()
- Returns `'health_check'` when `callType === 'health_check'`
- Returns `'cognitive_call'` when `callType === 'cognitive'`
- Returns `'general_call'` for `'general'` and any unknown type

### generalCall()
- Invokes compiled `ConversationGraph` with `messages`, `userId`, `conversationId`
- Returns `{ response }` from graph result

### healthCheck() — durable execution
- **New thread** (empty state): invokes `HealthCheckGraph` with initial state, returns `{ response, isHealthCheckComplete }`
- **Interrupted thread** (has `next` steps): extracts user answer from last message, resumes with `Command({ resume, update })`, appends AI question + human answer to messages
- **Completed thread** (no `next`, has values): returns hardcoded completion message with `isHealthCheckComplete: true`
- Thread ID format: `health_check:{userId}:{conversationId}`

### cognitiveCall() — durable execution
- **New thread**: invokes `CognitiveGraph` with initial state, returns `{ response, isCognitiveComplete }`
- **Interrupted thread**: resumes with `Command({ resume, update })`, same pattern as health check
- **Completed thread**: returns hardcoded completion message with `isCognitiveComplete: true`
- Thread ID format: `cognitive:{userId}:{conversationId}`

### Durable execution shared behaviors
- Extracts content as string from last message (handles both string and non-string content)
- Adds `AIMessage` for previous question and `HumanMessage` for user answer when resuming
- Defaults completion flags to `false` when not present in result

## High-Impact Error Scenarios

### Session not found in Redis
- `getJSON()` returns null for the conversation
- Verify defaults to general call routing (doesn't crash)

### Health/Cognitive graph throws during invoke
- Persona graph fails mid-execution
- Verify error propagates (LLMRoute handles the response)

### Checkpointer state inconsistent
- `getState()` returns values but no `next` (completed state)
- Verify returns completion message rather than attempting to resume

## Test Approach
- Mock `RedisClient`, `ConversationGraph`, `HealthCheckGraph`, `CognitiveGraph`
- Mock checkpointer `getState()` to simulate new/interrupted/completed threads
- Verify correct `Command` structure when resuming durable graphs
- Verify thread ID format matches expected pattern
