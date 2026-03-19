# Media Streaming

## Purpose
Bridge bidirectional audio between Twilio (phone call) and ElevenLabs (voice AI) via WebSocket connections.

## Key Behaviors
- WebSocket server at `/outbound-media-stream` receives Twilio audio events (connected, start, media, stop, mark)
- On `start` event: loads user profile, retrieves call type from Redis, gets ElevenLabs signed URL, opens WSS connection
- Sends system prompt + dynamic first message to ElevenLabs on connection open
- Audio relay: Twilio audio → ElevenLabs (user speech), ElevenLabs audio → Twilio (AI speech)
- Keepalive ping to ElevenLabs every 30s
- On close: fires post-call BullMQ job (3s delay), cleans up sessions and connections
- Ends Twilio call via API on close to ensure clean teardown

## Tradeoffs
We manage the Twilio↔ElevenLabs WebSocket bridge ourselves rather than using ElevenLabs' built-in Twilio integration API. See [ADR-005](../../decisions/adr-005-websocket-bridge.md) for full rationale. Key tradeoffs:
- **We handle:** audio format relay, keepalive, voice activity detection edge cases, error recovery
- **We gain:** full control over session data, prompt injection, post-call pipeline wiring, Redis session registration

## Inputs / Outputs
- **In:** Twilio WebSocket audio stream (mulaw PCM)
- **Out:** ElevenLabs WebSocket audio stream (base64)
- **Side effects:** Session registration, post-call job dispatch

## Dependencies
- ElevenLabs client (signed URL, conversation config)
- OpenAI client (dynamic first message generation)
- System prompts (General, Health, Cognitive)
- User profile (UserHandler → UserRepository)
- PostCallQueue (BullMQ producer)
- SessionManager (Redis session tracking)

## Current Status
Fully implemented in `apps/server/src/services/WebSocketService.ts`.

## Related Docs
- [Call Flow](./call-flow.md) — how calls are initiated before streaming begins
- [Prompts](./prompts.md) — system prompts sent to ElevenLabs
- [Session Management](./session-management.md) — session lifecycle during streaming
- [ADR-005: WebSocket Bridge](../../decisions/adr-005-websocket-bridge.md) — why we manage the bridge ourselves
