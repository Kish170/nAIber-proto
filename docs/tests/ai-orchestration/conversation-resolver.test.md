# Conversation Resolver — Test Spec

Reference PRD: [conversation-resolver.md](../../prds/ai-orchestration/conversation-resolver.md)

## Unit Tests

### resolveConversation()

#### Primary path (llm.user_id)
- Extracts `user` field from request object
- Also checks `user_id` field as fallback
- Looks up `rag:user:{userId}` in Redis → gets conversationId
- Looks up `session:{conversationId}` → returns full `ResolvedConversation`
- Returns `{ conversationId, userId, phone, callSid }` on success

#### Fallback: userId from system prompt (to be removed)
- Falls through when `request.user` and `request.user_id` are missing
- Extracts userId via regex from system message content (`/user\s*ID[:\s]+([a-f0-9\-]+)/i`)
- Same Redis lookup chain: `rag:user:{userId}` → `session:{conversationId}`

#### Fallback: phone from system prompt (to be removed)
- Falls through when both userId paths fail
- Extracts phone via regex from system message content (`/phone[:\s]+(\+?[\d\s\-()]+)/i`)
- Strips whitespace, dashes, parens from matched phone
- Looks up `rag:phone:{phone}` → `session:{conversationId}`

#### Resolution failures
- Returns `null` when no identifiers found in request or messages
- Returns `null` when userId found but no Redis mapping exists
- Returns `null` when phone found but no Redis mapping exists
- Returns `null` when conversationId found but session doesn't exist
- Returns `null` on any thrown exception (caught at top level)

### getConversationDetails()
- Fetches session JSON from `session:{conversationId}`
- Returns parsed `ResolvedConversation` or `null`

### extractUserIdFromMessages()
- Finds system message in messages array
- Returns `null` if no system message exists
- Matches UUID-format userId from system prompt text

### extractPhoneFromMessages()
- Finds system message in messages array
- Returns `null` if no system message exists
- Matches phone numbers with optional `+`, digits, spaces, dashes, parens
- Normalizes matched phone by stripping non-digit characters (except leading +)

## High-Impact Error Scenarios

### Redis unavailable during lookup
- Any `redisClient.get()` or `getJSON()` throws
- Verify returns `null` (error caught) — LLM request still gets handled gracefully

### Session exists but is malformed
- `getJSON()` returns object missing expected fields
- Verify returns whatever is parsed (no validation currently) — downstream should handle

## Test Approach
- Mock `RedisClient` (get, getJSON)
- Create test requests with various combinations: `user` field present/absent, system messages with/without userId/phone
- Test resolution priority order: `user` field → userId regex → phone regex
- Verify each fallback is only attempted when previous path fails
