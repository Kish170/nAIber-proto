# ADR-005: Manage Twilio↔ElevenLabs WebSocket Bridge Ourselves

**Status:** Accepted (revisit planned)
**Date:** Prototype phase, 2025

## Context

ElevenLabs provides a built-in Twilio integration via their API — a single REST call (`POST /v1/convai/twilio/outbound-call`) that sets up the WebSocket bridge between Twilio and ElevenLabs automatically. This handles audio relay, turn detection, and session management without custom code.

The alternative is managing the WebSocket bridge ourselves: our server opens separate WebSocket connections to both Twilio and ElevenLabs, relays audio between them, and handles session lifecycle manually.

## Considered Options

| Option | Notes |
|---|---|
| **ElevenLabs built-in Twilio integration** | Single API call, ElevenLabs manages the WSS bridge end-to-end |
| **Custom WebSocket bridge** | We manage both WebSocket connections, relay audio, handle lifecycle |

## Decision

**Chosen: Custom WebSocket bridge**

The built-in integration abstracts away the session lifecycle, which prevents us from:

1. **Session registration.** We create Redis sessions with call metadata (callSid, callType, userId) that drive downstream routing. The built-in integration doesn't expose hooks for registering custom session data when a conversation starts.

2. **Post-call pipeline wiring.** On call close, we dispatch BullMQ jobs with conversation context. The built-in integration's lifecycle events don't provide the hooks needed to trigger our post-call processing.

3. **Call type routing.** We store `call_type:{callSid}` in Redis before the call connects, then read it during the `start` event to select the correct persona prompt. This requires intercepting the Twilio stream start event, which the built-in integration handles internally.

## How We Handle Per-Call Configuration

We use `conversation_config_override` in the WebSocket `conversation_initiation_client_data` message. Each call gets its own system prompt, first message, and voice config at connection time — the base agent config is never mutated per-call. This means there are no concurrency/race condition issues even with simultaneous calls.

```json
{
  "type": "conversation_initiation_client_data",
  "conversation_config_override": {
    "agent": {
      "prompt": { "prompt": "<dynamic system prompt>" },
      "first_message": "<dynamic first message>",
      "language": "en"
    },
    "tts": { "voice_id": "<voice>" }
  }
}
```

## Consequences

**Positive:**
- Full control over session data, prompt injection, and post-call pipeline
- Can intercept all Twilio and ElevenLabs events for logging and debugging
- No concurrency issues — per-call overrides are session-local

**Negative / Trade-offs:**
- We handle audio format relay, keepalive management (30s ping), and WebSocket error recovery ourselves
- Voice activity detection edge cases are our responsibility
- More code to maintain in `WebSocketService.ts` compared to a single API call
- Must stay in sync with ElevenLabs WebSocket protocol changes

## Future Consideration: Built-in Integration + MCP

This decision should be revisited once the prototype is stable. Research confirms a viable simplification path:

### ElevenLabs Built-in Outbound Call API
`POST /v1/convai/twilio/outbound-call` accepts `conversation_initiation_client_data` with full `conversation_config_override` — per-call system prompt, first message, voice, and LLM params. Single REST call replaces our entire WebSocket bridge. Overrides are session-local (no concurrency issue).

Returns `{ conversation_id, callSid }` — which we'd need for session registration.

### Dynamic Variables
ElevenLabs recommends `dynamic_variables` with `{{ var_name }}` syntax in prompt templates for per-user personalization. This could replace our full prompt override approach — define the prompt template once on the agent, supply user-specific values at call time.

### MCP Tool Use
ElevenLabs agents can connect to external MCP servers (SSE + HTTP streamable transports). The agent can call tools during conversation with configurable approval modes (always ask, per-tool, autonomous).

Our session registration, post-call dispatch, and profile lookup could be exposed as MCP tools:
- `registerSession` — create Redis session with call metadata
- `getUserProfile` — fetch user data for context
- `dispatchPostCall` — queue post-call processing job
- `getCallType` — determine persona routing

### What This Would Look Like
1. Before call: send `POST /v1/convai/twilio/outbound-call` with dynamic system prompt and first message via `conversation_config_override`
2. During call: MCP tools handle session registration, profile lookup
3. After call: MCP tool or ElevenLabs webhook triggers post-call BullMQ dispatch

### Blockers / Open Questions
- **MCP not available for HIPAA-compliant deployments or zero-retention mode** — may be relevant depending on compliance requirements
- **Post-call hooks:** Does the built-in integration provide a reliable callback when the call ends? We need this to trigger post-call processing. The outbound call API returns `conversation_id` and `callSid`, but we need an end-of-call signal.
- **Session registration timing:** Currently we register the session when `conversation_id` is received during WebSocket setup. With the built-in integration, we get `conversation_id` in the REST response — registration could happen immediately after the API call, before the call even connects. Need to verify this doesn't cause issues.

### When to Revisit
After prototype is functionally complete. The built-in integration + MCP approach would significantly reduce telephony layer complexity.

## References
- [ElevenLabs Overrides](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides)
- [ElevenLabs Twilio Outbound Call API](https://elevenlabs.io/docs/api-reference/twilio/outbound-call)
- [ElevenLabs Twilio Personalization](https://elevenlabs.io/docs/eleven-agents/customization/personalization/twilio-personalization)
- [ElevenLabs Dynamic Variables](https://elevenlabs.io/docs/agents-platform/customization/personalization/dynamic-variables)
- [ElevenLabs MCP (Agent as Client)](https://elevenlabs.io/docs/eleven-agents/customization/tools/mcp)
- [ElevenLabs Agent Versioning](https://elevenlabs.io/docs/eleven-agents/operate/versioning)
