# ElevenLabs Client

## Purpose
Wrapper around the ElevenLabs Conversational AI API for voice session management and transcript retrieval.

## Key Behaviors
- `getSignedURL()` — generates a signed WebSocket URL for a new voice conversation
- `getStructuredTranscriptWithRetry()` — fetches call transcript from ElevenLabs API, retries up to 5 times with 3s delay (transcript may not be immediately available after call ends)
- Config passed via constructor (`apiKey`, `agentID`, `baseUrl`, `agentNumber`, `agentNumberId`)

## Transcript Retrieval Strategy
Retry with short intervals is preferred over a single longer delay:
- Adapts to actual availability — succeeds as early as possible (often on first or second attempt)
- Total retry window is ~15s (5 × 3s) but doesn't waste time if transcript is ready sooner
- The telephony server already adds a 3s head start delay before dispatching the BullMQ job, so the retry loop begins ~3s after the call ends
- A single long delay would either waste time (if ready early) or fail with no recourse (if still not ready)

## Consumers
- Telephony server (signed URL for WSS connection)
- llm-server PostCallWorker (transcript retrieval in GeneralPostCallGraph)

## Current Status
Fully implemented in `packages/shared-clients/src/ElevenlabsClient.ts`.

## Related Docs
- [Media Streaming](../../telephony/media-streaming.md) — uses signed URL for WSS connection
- [Post-Call Worker](../../ai-orchestration/post-call-worker.md) — consumes transcript via GeneralPostCallGraph
- [ADR-005: WebSocket Bridge](../../decisions/adr-005-websocket-bridge.md) — why we manage the WSS bridge ourselves
