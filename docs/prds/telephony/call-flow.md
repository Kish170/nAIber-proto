# Call Flow

## Purpose
Initiate outbound phone calls to elderly users via Twilio, routing each call to the correct persona (general, health check, cognitive).

## Key Behaviors
- `POST /call`, `POST /call/health-check`, `POST /call/cognitive` trigger outbound calls
- Call type stored in Redis (`call_type:{callSid}`, 60s TTL) so downstream services can route correctly
- `POST /twiml` returns TwiML XML that instructs Twilio to stream audio to the WebSocket endpoint
- Twilio dials the user's phone number and connects the audio stream to `/outbound-media-stream`
- On failure, returns `{ success: false, error }` — no retry at this layer

## Inputs / Outputs
- **In:** HTTP POST with call type
- **Out:** `{ success, callSid }` response; TwiML XML for Twilio stream setup

## Dependencies
- Twilio client (`@naiber/shared-clients`)
- Redis client (call type storage)
- Ngrok (dynamic URL resolution for Twilio callbacks)

## Current Status
Fully implemented in `apps/server/src/controllers/CallController.ts` and `apps/server/src/routes/CallRoutes.ts`.

## Related Docs
- [Media Streaming](./media-streaming.md) — what happens after the call connects
- [Session Management](./session-management.md) — how sessions are tracked
