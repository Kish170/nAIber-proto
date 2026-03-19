# ADR-006: System Prompts Live in Telephony Server

**Status:** Accepted
**Date:** Prototype phase, 2025

## Context

System prompts define persona behavior (tone, boundaries, conversation rules) and are injected into ElevenLabs at call start. The question was whether these should live in the telephony server (`apps/server`) or the AI orchestration server (`apps/llm-server`).

## Decision

**Chosen: Prompts live in `apps/server/src/prompts/`**

System prompts are sent directly over WebSocket to ElevenLabs during the `conversation_initiation_client_data` message — before llm-server is ever involved in the call. The telephony server is the only component that has access to the WebSocket connection at this point.

The prompts also require user profile data (name, age, conditions, last conversation summary) which the telephony server already loads via `UserHandler` during the `start` event. Moving prompts to llm-server would require either:
- An additional network call from server → llm-server to fetch the built prompt
- Duplicating user profile loading in llm-server for prompt building

Neither adds value since the telephony server already has everything needed.

## Consequences

**Positive:**
- No additional network hop — prompts built and sent in the same process that manages the WebSocket
- User profile data already available in the telephony server context
- Clean ownership: telephony server owns the full call setup lifecycle

**Negative / Trade-offs:**
- Prompt logic is separated from the LLM orchestration logic it governs — a developer modifying persona behavior needs to look in two places
- If prompts need data that only llm-server has (e.g. KG-derived context), the architecture would need to change

## Note
If we move to the built-in ElevenLabs Twilio integration (see [ADR-005](./adr-005-websocket-bridge.md)), prompts would be passed via the REST API call body rather than over WebSocket, but they would still be constructed in the service that initiates the call.
