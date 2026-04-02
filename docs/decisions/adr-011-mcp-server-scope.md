# ADR-011: `apps/mcp-server` Scope — Conversation-Time LLM Tools Only

**Status:** Accepted  
**Date:** 2026-04-02

## Context

When initially designing `apps/mcp-server` five tools were proposed:
`registerSession`, `getUserProfile`, `getCallType`, `dispatchPostCall`, `retrieveMemories`.

After review, only tools the LLM genuinely needs to call *during* a conversation belong in `mcp-server`. The others are lifecycle/infrastructure operations that are either already handled by `apps/server` or belong in `scheduler-server` when it is built.

## Decision

**`apps/mcp-server` exposes exactly two tools:**

| Tool | Purpose |
|---|---|
| `getUserProfile(userId)` | Fetch elderly profile from Prisma for LLM context injection |
| `retrieveMemories(query, userId)` | Qdrant vector search + KG enrichment — RAG for conversation continuity |

### Removed tools and where that responsibility lives

**`registerSession` → `scheduler-server`** (see ADR-010)  
When `scheduler-server` calls `POST /v1/convai/twilio/outbound-call` it receives `{ conversation_id, callSid }` and already holds `userId` and `callType`. Session registration is a server-side side-effect of placing the call — not an LLM decision.

**`getCallType` → system prompt / `scheduler-server`**  
Call type is injected into the system prompt at call-initiation time via `conversation_config_override`. The LLM already knows which persona it is. When `scheduler-server` handles outbound call initiation it will also manage call-type routing. There is no mid-conversation reason for the LLM to look this up.

**`dispatchPostCall` → `apps/server` today, webhook handler tomorrow**  
Post-call BullMQ dispatch fires on call termination — a lifecycle event, not an LLM decision. Today it is triggered by the WebSocket close event in `WebSocketService.ts`. When the WebSocket bridge is retired (ADR-005), an ElevenLabs end-of-call webhook will trigger it. Neither path involves the LLM.

## Rationale

An MCP tool is appropriate when:
- The LLM needs information it cannot have in its initial context (profile data, memory retrieval)
- The action is a *conversational* decision (ask a question, look something up mid-dialogue)

An MCP tool is **not** appropriate when:
- The action is triggered by an infrastructure event (call start, call end)
- All required data is available server-side before the LLM is involved
- The action has no bearing on what the LLM says next

## Consequences

- `mcp-server` stays small and focused — easy to extend with future conversation-time tools (e.g. `logHealthObservation`, `scheduleFollowUp`)
- `apps/server` is not replaced by `mcp-server`; they serve different layers (telephony infrastructure vs. LLM tooling)
- `scheduler-server` must implement session registration and call-type routing as part of its outbound call handler (ADR-010)
- Post-call dispatch remains in `apps/server` until the WebSocket bridge is retired

## References

- [ADR-005](./adr-005-websocket-bridge.md) — WebSocket bridge migration plan
- [ADR-008](./adr-008-general-persona-migration.md) — General persona RAG migration
- [ADR-010](./adr-010-session-registration-scheduler.md) — Session registration in scheduler-server
