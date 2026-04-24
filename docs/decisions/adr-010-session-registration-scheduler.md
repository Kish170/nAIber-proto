# ADR-010: Session Registration Belongs in `scheduler-server`, Not as an MCP Tool

**Status:** Accepted  
**Date:** 2026-04-02

## Context

When designing `apps/mcp-server` we initially included a `registerSession` MCP tool — the intention was that ElevenLabs would call it at the start of a conversation to write the Redis session keys currently managed by `WebSocketService.ts`.

However, `registerSession` is a poor fit for an LLM-callable MCP tool because:

1. **It is not conversational.** Session registration is infrastructure setup — it should happen before or at the moment the call connects, not as a decision the LLM makes mid-conversation.
2. **All required data is available server-side before the call starts.** When `scheduler-server` initiates an outbound call via ElevenLabs' API it already holds every field needed:

| Field | Source |
|---|---|
| `conversationId` | Returned by `POST /v1/convai/twilio/outbound-call` response |
| `callSid` | Returned by same response |
| `userId` | Known at scheduling time (the elderly profile being called) |
| `callType` | Known at scheduling time (general / health_check / cognitive) |

3. **MCP tools carry overhead.** Every MCP tool invocation adds a round-trip and an LLM decision point. Session registration doesn't benefit from either.

## Decision

**Session registration will be implemented as a side-effect of the outbound call initiation in `scheduler-server`**, not as an MCP tool.

### Sequence (when scheduler-server is implemented)

```
scheduler-server
  1. Determine userId, callType for the scheduled call
  2. POST /v1/convai/twilio/outbound-call  →  { conversation_id, callSid }
  3. Fetch user profile from Prisma (UserRepository.findById) to get phone number
  4. Write Redis keys (mirrors existing WebSocketService + CallController contracts):
       call_type:{callSid}         →  callType         EX 60
       session:{conversationId}    →  SessionData JSON  EX 3600
       rag:user:{userId}           →  conversationId    EX 3600
  5. Proceed — ElevenLabs connects, session is already registered
```

### Redis key contracts to replicate (do not change key names or TTLs)

```typescript
// mirrors CallController.ts
await redis.set(`call_type:${callSid}`, callType, { EX: 60 });

// mirrors SessionManager.createSession
await redis.setJSON(`session:${conversationId}`, {
    callSid, conversationId, userId,
    phone,           // from UserRepository.findById
    startedAt:       new Date().toISOString(),
    lastMessageAt:   new Date().toISOString(),
    callType,
}, 3600);

// mirrors WebSocketService.registerSession
await redis.set(`rag:user:${userId}`, conversationId, { EX: 3600 });
```

## Consequences

- `registerSession` is **removed** from `apps/mcp-server` — it was never committed to the MCP tool surface.
- `apps/mcp-server` exposes four tools: `getUserProfile`, `getCallType`, `dispatchPostCall`, `retrieveMemories`.
- When `scheduler-server` is built, session registration logic (above) must be included in the outbound call handler.
- The existing `WebSocketService.ts` session registration path stays untouched until the WebSocket bridge is retired (separate branch).

## References

- [ADR-005](./adr-005-websocket-bridge.md) — WebSocket bridge & future built-in integration consideration (see "Session registration timing" note)
- [ADR-008](./adr-008-general-persona-migration.md) — MCP tools for general persona migration
- `apps/server/src/services/SessionManager.ts` — canonical SessionData interface and Redis key contract
- `apps/server/src/controllers/CallController.ts` — `call_type:{callSid}` write contract
- `apps/server/src/services/WebSocketService.ts` — `rag:user:{userId}` write contract
- [ElevenLabs Twilio Outbound Call API](https://elevenlabs.io/docs/api-reference/twilio/outbound-call)
