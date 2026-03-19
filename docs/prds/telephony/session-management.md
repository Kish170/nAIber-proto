# Session Management

## Purpose
Track active call sessions in Redis so downstream services (llm-server) can resolve which user and conversation are associated with incoming LLM requests.

## Key Behaviors
- Session created when ElevenLabs returns a `conversation_id` during call setup
- Session data stored at `session:{conversationId}` with 1hr TTL
- Mapping key created: `rag:user:{userId}` → conversationId (1hr TTL) for fast lookup by ConversationResolver
- Sessions queryable via `GET /sessions` endpoint
- Session deleted on call close (before post-call job fires)

## Session Data Shape
```
{ callSid, conversationId, userId, phone, streamSid, startedAt, lastMessageAt, callType }
```

## Why Custom Sessions (Not ElevenLabs)
ElevenLabs accepts a `user_id` in the conversation config (via `llm.user_id`), which we use as the primary resolution path in ConversationResolver. However, we maintain our own Redis sessions because:
- We need to store call metadata (callSid, callType, phone) that ElevenLabs doesn't track
- Session data drives post-call job routing and cleanup
- Redis TTLs give us automatic cleanup of stale sessions

## Cleanup Needed
- `rag:phone:{phone}` key and ConversationResolver regex fallbacks should be removed (security concern — userId/phone in plaintext in system prompt). Only the primary path (`llm.user_id` → `rag:user:{userId}`) is needed. Tracked in `docs/tracking/implementation.md`.

## Dependencies
- Redis client (`@naiber/shared-clients`)

## Current Status
Fully implemented in `apps/server/src/services/SessionManager.ts`.

## Related Docs
- [Media Streaming](./media-streaming.md) — creates and deletes sessions
- [Conversation Resolver](../ai-orchestration/conversation-resolver.md) — reads sessions to resolve LLM requests
- [Redis Keys](../infrastructure/redis-keys.md) — full key pattern reference
