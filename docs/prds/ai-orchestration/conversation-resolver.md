# Conversation Resolver

## Purpose
Resolve incoming ElevenLabs LLM requests to the correct active conversation by looking up Redis session data.

## Key Behaviors
- ElevenLabs sends `POST /v1/chat/completions` — request contains `user` field (set via `llm.user_id` in conversation config)
- Primary path: extract userId from request → lookup `rag:user:{userId}` → get conversationId → lookup `session:{conversationId}` → return full session data
- Returns `ResolvedConversation { conversationId, userId, phone, callSid }` or null

## Current Fallbacks (To Be Removed)
- Extract userId from system prompt via regex → same Redis lookup
- Extract phone from system prompt via regex → lookup `rag:phone:{phone}`
- **Security concern:** these fallbacks put userId/phone in plaintext in the system prompt. The primary path (`llm.user_id`) is sufficient. Removal tracked in `docs/tracking/implementation.md`.

## Dependencies
- Redis client (session and mapping key lookups)

## Current Status
Fully implemented in `apps/llm-server/src/services/ConversationResolver.ts`. Fallbacks pending removal.

## Related Docs
- [Session Management](../telephony/session-management.md) — creates the Redis keys this service reads
- [SupervisorGraph](./supervisor.md) — consumes the resolved conversation context
