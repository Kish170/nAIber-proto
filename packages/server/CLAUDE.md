# @naiber/server

Telephony layer — handles Twilio webhooks, ElevenLabs WebSocket sessions, and dispatches post-call BullMQ jobs. Runs on port 3000.

## Communication
- **Receives:** Twilio WebSocket audio at `/outbound-media-stream`, TwiML requests at `POST /twiml`
- **Exposes:** `POST /call` (general), `POST /call/health-check` (health), `GET /sessions`
- **Connects to:** ElevenLabs ConvAI API via signed WSS URL (bidirectional audio streaming)
- **Dispatches:** BullMQ `post-call-processing` jobs → consumed by llm-server PostCallWorker
- **Note:** Server does NOT call llm-server directly. ElevenLabs routes LLM requests to llm-server's `/v1/chat/completions` endpoint itself.

## Call Lifecycle
1. **Initiation** — `POST /call` → `CallController.createCall()` → TwilioClient dials user, stores `call_type:{callSid}` in Redis (60s TTL)
2. **Twilio connects** — Audio streams to WSS `/outbound-media-stream` → `CallController` creates `WebSocketService`
3. **ElevenLabs connects** — On Twilio "start" event, `WebSocketService` loads UserProfile, gets ElevenLabs signed URL, opens WSS, sends system prompt + first message
4. **Session registered** — On `conversation_id` received, `SessionManager` creates Redis session (`session:{conversationId}`, 1hr TTL) + mapping keys (`rag:user:{userId}`, `rag:phone:{phone}`)
5. **Streaming** — Bidirectional audio: Twilio ↔ WebSocketService ↔ ElevenLabs
6. **Call ends** — ElevenLabs closes WSS → `WebSocketService.closeWSConnection()` → clears intervals, closes both sockets
7. **Post-call** — 3s delay, then `PostCallQueue.add()` fires BullMQ job. `SessionManager.deleteSession()` cleans up Redis.

## Environment
- `PORT` — Server port (default 3000)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER` — Twilio credentials
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_BASE_URL`, `ELEVENLABS_NUMBER_ID` — ElevenLabs config
- `ELEVENLABS_VOICE_ID` — Voice for TTS
- `OPENAI_API_KEY`, `OPENAI_BASE_URL` — For prompt generation
- `PHONE_NUMBER` — User's phone number to call
- `REDIS_URL` — Redis connection (default `redis://localhost:6379`)
- `BASE_URL`, `TWILIO_URL`, `STREAM_URL` — Set by ngrok or env for callback URLs
- `USE_DYNAMIC_NGROK`, `NGROK_API_URL` — Dynamic ngrok tunnel config

## What It Owns
- `prompts/` — System prompts passed directly to ElevenLabs over WSS. Do NOT move these out of server.
  - `PromptInterface.ts` — Abstract base class with shared tone, cultural sensitivity, emergency detection.
  - `GeneralPrompt.ts` — Companionship/active listener persona.
  - `HealthPrompt.ts` — Structured health check-in data collector.
  - `CognitivePrompt.ts` — Placeholder (empty).
- `handlers/UserHandler.ts` — `UserProfile` class. Loads user data for prompt generation.
- `services/WebSocketService.ts` — ElevenLabs WSS session management, prompt injection, call lifecycle.
- `services/SessionManager.ts` — Redis-backed call session tracking.
- `controllers/CallController.ts` — WSS server init, call creation, TwiML generation.
- `queues/PostCallQueue.ts` — BullMQ producer. Imports `PostCallJobData` and `POST_CALL_QUEUE_NAME` from `@naiber/shared-core`.
- `clients/RedisClient.ts` — Local Redis client (separate from shared RedisClient).

## What It Does NOT Own
- No LLM orchestration or LangGraph logic (that's `llm-server`).
- No data persistence beyond session tracking (repositories are in `shared-data`).

## Dependencies
- `@naiber/shared-core` (queue contracts)
- `@naiber/shared-clients` (Twilio, ElevenLabs, OpenAI, Redis, Prisma clients)
- `@naiber/shared-data` (UserRepository via UserHandler)
- `bullmq`, `express`, `ws`, `twilio`

## Gotchas
- System prompts contain persona-specific rules for ElevenLabs voice AI. Changes affect live call behavior.
- PostCallQueue deduplicates by conversationId with a 5-minute TTL.
- Post-call job fires with a 3s delay to allow transcript readiness.
- WebSocket keepalive to ElevenLabs runs every 30s.