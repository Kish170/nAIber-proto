# Session Management — Test Spec

Reference PRD: [session-management.md](../../prds/telephony/session-management.md)

## Unit Tests

### SessionManager

#### Singleton
- `getInstance()` returns same instance on repeated calls
- Exported `sessionManager` is the singleton instance

#### initialize()
- Connects to Redis on first call
- Skips connection on subsequent calls (`initialized` flag)

#### createSession()
- Stores session data at `session:{conversationId}` as JSON
- Sets 1hr (3600s) TTL on the key
- Session data includes all fields: `callSid`, `conversationId`, `userId`, `phone`, `streamSid`, `startedAt`, `lastMessageAt`, `callType`

#### getSession()
- Returns parsed `SessionData` for existing session
- Returns `null` for non-existent conversation ID

#### updateSession()
- Merges partial updates with existing session data
- Resets TTL to 1hr on update
- No-ops if session doesn't exist (no error thrown)

#### deleteSession()
- Removes `session:{conversationId}` key from Redis
- No error if key doesn't exist

#### getAllActiveSessions()
- Returns all sessions matching `session:*` pattern
- Returns empty array when no sessions exist
- Skips keys that fail to parse as JSON (doesn't crash on corrupt data)

#### cleanupExpiredSessions()
- Deletes all keys matching `session:*`
- Returns count of deleted keys

## High-Impact Error Scenarios

### Redis unavailable during session creation
- `redisClient.setJSON()` throws (Redis down or connection lost)
- Verify error propagates to caller (WebSocketService handles it)

### Session data corrupted
- `getJSON()` returns malformed data
- Verify `getAllActiveSessions()` skips bad entries and returns valid ones

## Test Approach
- Mock `redisClient` (setJSON, getJSON, getClient, getKeysByPattern, deleteByPattern)
- Test data shape matches `SessionData` interface
- Verify correct Redis key format and TTL values
