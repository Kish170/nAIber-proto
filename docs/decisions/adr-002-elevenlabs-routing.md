# ADR-002: Route ElevenLabs LLM Requests Directly to llm-server

**Status:** Accepted
**Date:** Prototype phase, 2025

## Context

ElevenLabs ConvAI supports two modes for LLM integration:

1. **ElevenLabs' own LLM** — You configure the agent with tools (MCP-style). ElevenLabs handles the LLM calls internally. The only control surface is the system prompt and tool definitions.

2. **Custom LLM endpoint** — You provide a URL that ElevenLabs calls per turn with an OpenAI-compatible `POST /v1/chat/completions` request. ElevenLabs handles voice synthesis and turn detection; your endpoint handles all LLM logic.

The system requires full control over response generation: persona-specific graphs, RAG memory retrieval, durable health check execution, topic management, and post-call processing. These cannot be expressed purely through tool definitions and prompting.

The question was how to expose the custom LLM endpoint: have `server` proxy ElevenLabs requests to `llm-server`, or have ElevenLabs call `llm-server` directly.

## Considered Options

| Option | Notes |
|---|---|
| **ElevenLabs calls llm-server directly** | `server` configures the ElevenLabs session with `llm-server`'s URL; ElevenLabs dials it per turn without going through `server` |
| **server proxies ElevenLabs → llm-server** | `server` exposes an LLM endpoint, receives ElevenLabs requests, and forwards them to `llm-server` |
| **Use ElevenLabs' own LLM** | Stay within ElevenLabs' tool/MCP model, no custom endpoint |

## Decision

**Chosen: ElevenLabs calls llm-server directly**

Using ElevenLabs' own LLM was rejected early — the tool/MCP model gave insufficient control. Prompting alone cannot express conditional RAG retrieval, structured multi-turn health checks, or persona-specific response logic. The call behaviors we need require owning the full LLM layer.

Between the two custom endpoint options, direct routing was chosen over server-proxied routing for two reasons:

1. **Separation of concerns.** `server`'s responsibility is telephony: Twilio WebSockets, ElevenLabs audio sessions, session tracking, prompt injection, BullMQ dispatch. Adding an LLM proxy route would blur this boundary — `server` would need to know about LLM request shapes and response formats, and any change to the LLM API contract would touch both packages.

2. **Customization surface.** Direct routing gives `llm-server` full ownership of the request/response cycle. It can stream, apply middleware, inject context from Redis, run LangGraph graphs, and shape responses however needed — without `server` as an intermediary that could introduce latency or constrain the response format.

The proxied option was not entirely dismissed — it would have allowed `server` to enrich requests with session context before forwarding. In practice, `llm-server`'s `ConversationResolver` handles session context lookup from Redis directly, so the enrichment advantage does not materialize.

## Consequences

**Positive:**
- `server` is purely telephony — no LLM logic, no API contract coupling to `llm-server`.
- `llm-server` has full control over its request handling, streaming format, and response logic.
- Clean boundary makes both services independently deployable and testable.

**Negative / Trade-offs:**
- `server` and `llm-server` cannot communicate directly during a call. If `llm-server` needs to push a message to the call (e.g. emergency escalation mid-turn), it cannot — it can only respond to ElevenLabs pulls.
- Debugging a single conversation turn requires correlating logs across two services (`server` for the WebSocket events, `llm-server` for the LLM response). `conversationId` is the correlation key.
- `llm-server` must independently resolve session context (user ID, call type) from Redis on every request — there is no enriched handoff from `server`.
