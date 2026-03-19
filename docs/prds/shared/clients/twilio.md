# Twilio Client

## Purpose
Wrapper around the Twilio SDK for outbound calls, call management, TwiML generation, and SMS.

## Key Behaviors
- `createCall(userNumber)` — initiates outbound call, returns `{ success, callSid }`
- `endCall(callSid)` — terminates an active call (used for health/cognitive completion teardown)
- `generateStreamTwiml(agentId)` — generates TwiML XML to connect Twilio audio to WebSocket stream
- `generateErrorTwiml(message)` — fallback TwiML with spoken error message
- SMS methods for notification delivery
- Config passed via constructor (`accountSid`, `authToken`, `agentNumber`, `baseUrl`, `streamUrl`)

## Consumers
- Telephony server (call initiation, TwiML generation)
- llm-server (call termination after health/cognitive completion via `scheduleCallEnd()`)

## Current Status
Fully implemented in `packages/shared-clients/src/TwilioClient.ts`.

## Related Docs
- [Call Flow](../../telephony/call-flow.md) — uses createCall and generateStreamTwiml
- [Media Streaming](../../telephony/media-streaming.md) — uses endCall on close
