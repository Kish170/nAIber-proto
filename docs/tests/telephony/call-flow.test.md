# Call Flow — Test Spec

Reference PRD: [call-flow.md](../../prds/telephony/call-flow.md)

## Unit Tests

### CallController

#### Constructor
- Throws if any ElevenLabs env var is missing (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_BASE_URL`, `TWILIO_NUMBER`, `ELEVENLABS_NUMBER_ID`)
- Throws if any Twilio env var is missing (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `PHONE_NUMBER`, `TWILIO_URL`, `STREAM_URL`)
- Creates `TwilioClient` with correct config when all env vars present

#### createCall()
- Calls `twilioClient.createCall()` with the user's phone number
- On success, stores `call_type:{callSid}` in Redis with 60s TTL
- Returns `{ success: true, callSid }` on success
- Returns `{ success: false, error }` when `twilioClient.createCall()` fails
- Passes correct call type for each variant: `'general'`, `'health_check'`, `'cognitive'`

#### generateStreamTwiml()
- Delegates to `twilioClient.generateStreamTwiml()` with agent ID
- Returns error TwiML via `generateErrorTwiml()` when an exception is thrown

#### initializeWSServer()
- Creates WebSocket server on `/outbound-media-stream` path
- Throws if no HTTP server provided
- On new connection, creates `WebSocketService` instance
- Forwards incoming messages to `webSocketService.twilioEventProcessor()`
- Calls `webSocketService.closeWSConnection()` on socket close

### CallRoutes

#### POST /call
- Returns 200 with result from `callController.createCall('general')`
- Returns 500 with `{ success: false, error }` when controller throws

#### POST /call/health-check
- Calls `callController.createCall('health_check')` and returns result
- Returns 500 on controller error

#### POST /call/cognitive
- Calls `callController.createCall('cognitive')` and returns result
- Returns 500 on controller error

#### POST /twiml
- Returns content-type `text/xml` with TwiML from controller
- Returns 500 with fallback `<Say>` TwiML on error

#### GET /sessions
- Returns `{ count, sessions }` from `SessionManager.getAllActiveSessions()`
- Returns 500 on error

## High-Impact Error Scenarios

### Call created but Redis store fails
- `twilioClient.createCall()` succeeds but `redisClient.set()` throws
- Current behavior: returns `{ success: false }` — call exists in Twilio but type is unknown
- Verify the error is caught and returned (no unhandled rejection)

### WebSocket connection drops during message processing
- `twilioEventProcessor()` throws mid-message
- Verify the error doesn't crash the WSS server or affect other connections

## Test Approach
- Mock `TwilioClient`, `RedisClient`, `WebSocketService` — no external calls
- Use supertest for route-level tests
- Verify Redis key format (`call_type:{callSid}`) and TTL (60s) via mock assertions
