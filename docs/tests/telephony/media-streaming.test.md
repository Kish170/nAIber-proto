# Media Streaming — Test Spec

Reference PRD: [media-streaming.md](../../prds/telephony/media-streaming.md)

## Unit Tests

### WebSocketService

#### Constructor
- Sets `callType` to `'general'` for unknown/default values
- Correctly assigns `'health_check'` and `'cognitive'` call types
- Creates `ElevenLabsClient` and `OpenAIClient` from config/env

#### twilioEventProcessor()
- Parses incoming buffer as JSON
- Routes `connected` event to `manageConnectedEvent()`
- Routes `start` event to `manageStartEvent()` — retrieves call type from Redis, loads user profile, connects to ElevenLabs
- Routes `media` event to `manageMediaEvent()` — forwards audio payload to ElevenLabs
- Routes `stop` event to `manageStopEvent()` — captures callSid if not already set
- Routes `mark` event to `manageMarkEvent()`
- Logs unknown events without crashing
- Catches and logs JSON parse errors (malformed messages)

#### manageStartEvent()
- Reads `call_type:{callSid}` from Redis to determine call type
- Defaults to `'general'` if no call type found in Redis
- Loads user profile via `UserProfile.loadByPhone()`
- Closes Twilio WebSocket if `PHONE_NUMBER` env var is missing
- Closes Twilio WebSocket if user profile not found
- Calls `connectToElevenLabs()` with loaded user profile

#### connectToElevenLabs()
- Gets signed URL from `elevenLabsClient.getSignedURL()`
- Selects correct prompt builder based on call type:
  - `'general'` → `buildGeneralSystemPrompt` / `buildGeneralFirstMessage`
  - `'health_check'` → `buildHealthSystemPrompt` / `buildHealthFirstMessage`
  - `'cognitive'` → `buildCognitiveSystemPrompt` / `buildCognitiveFirstMessage`
- Opens WebSocket to signed URL
- Stores connection pair in `localConnections` map
- Registers event handlers (open, message, error, close)

#### handleOpen()
- Sends `conversation_initiation_client_data` message with:
  - System prompt and first message
  - `llm.user_id` set to user profile ID
  - `tts.voice_id` from env
  - `asr.user_input_audio_format` set to `pcm_mulaw`
  - `asr.quality` set to `high`
- Starts keepalive ping interval at 30s

#### handleMessage()
- Captures `conversation_id` from `conversation_initiation_metadata_event`
- Calls `registerSession()` when conversation ID is received
- Forwards audio chunks to Twilio via `sendAudioToTwilio()`
- Handles both `audio.chunk` and `audio_event.audio_base_64` formats

#### sendAudioToTwilio()
- Sends media event with `streamSid` and audio payload
- Skips send if `streamSid` not set yet (warns, doesn't crash)
- Skips send if Twilio WebSocket is not open

#### sendAudioToElevenLabs()
- Converts base64 audio and sends as `user_audio_chunk`
- Skips send if ElevenLabs WebSocket is not open

#### closeWSConnection()
- Fires post-call workflow (non-blocking — errors caught separately)
- Deletes session from `SessionManager`
- Removes local connection from map
- Clears keepalive interval
- Closes ElevenLabs WebSocket if open
- Closes Twilio WebSocket if open
- Ends Twilio call via `twilioClient.endCall()` if callSid available

#### processPostCallWorkflow()
- Skips if already completed (`postCallWorkflowCompleted` flag)
- Skips if no user profile or conversation ID
- Waits 3s before dispatching (transcript readiness)
- Enqueues BullMQ job with `conversationId`, `userId`, `isFirstCall`, `callType`, `timestamp`
- Sets `postCallWorkflowCompleted = true` even on error (prevents duplicate dispatch)

#### registerSession()
- Creates session via `SessionManager.createSession()` with all session data
- Sets `rag:user:{userId}` Redis key with 1hr TTL
- Sets `rag:phone:{phone}` Redis key with 1hr TTL
- Skips if user profile or conversation ID missing
- Catches and logs Redis errors without crashing

## High-Impact Error Scenarios

### ElevenLabs WebSocket fails to connect
- `getSignedURL()` throws or WebSocket connection fails
- Verify Twilio WebSocket is gracefully closed (user hears nothing, call ends cleanly)

### ElevenLabs WebSocket drops mid-call
- `handleClose()` is triggered unexpectedly
- Verify post-call workflow still fires, sessions are cleaned up, Twilio call is ended

### Post-call job dispatch fails
- `PostCallQueue.add()` throws
- Verify `postCallWorkflowCompleted` is still set to `true` (no retry loop)
- Verify session cleanup and WebSocket teardown still happen

### User profile not found during start event
- `UserProfile.loadByPhone()` returns null
- Verify Twilio WebSocket is closed (no hanging connection)
- Verify no ElevenLabs connection is attempted

## Test Approach
- Mock `ElevenLabsClient`, `OpenAIClient`, `TwilioClient`, `RedisClient`, `SessionManager`, `PostCallQueue`
- Use mock WebSocket objects for both Twilio and ElevenLabs sides
- Verify message format sent to ElevenLabs (init message structure)
- Verify cleanup order in `closeWSConnection()`
