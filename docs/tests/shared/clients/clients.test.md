# Shared Clients — Test Spec

Reference PRDs: [openai](../../prds/shared/clients/openai.md), [elevenlabs](../../prds/shared/clients/elevenlabs.md), [twilio](../../prds/shared/clients/twilio.md), [prisma](../../prds/shared/clients/prisma.md), [redis](../../prds/shared/clients/redis.md), [qdrant](../../prds/shared/clients/qdrant.md)

## OpenAIClient

### Constructor & Singleton
- `getInstance()` returns same instance for same config
- Creates underlying OpenAI SDK client with apiKey and baseUrl

### generalGPTCall()
- Sends chat completion request and returns full response
- Supports JSON response format when specified
- Uses gpt-4o model, temperature 0.7

### streamChatCompletion()
- Returns streaming response from OpenAI SDK
- Passes through request parameters correctly

### generateEmbeddings()
- Returns number array for input text
- Uses text-embedding-3-small model

### returnEmbeddingModel() / returnChatModel()
- Returns LangChain-compatible OpenAIEmbeddings instance
- Returns LangChain-compatible ChatOpenAI instance

## ElevenLabsClient

### getSignedURL()
- Returns signed WebSocket URL string
- Makes correct API call with agent ID and API key

### getTranscriptWithRetry()
- Returns flattened transcript string (role: message format)
- Retries up to 5 times with configurable delay
- Returns empty/throws after all retries exhausted

### getStructuredTranscriptWithRetry()
- Returns array of `TranscriptMessage` objects with `time_in_call_secs`
- Same retry behavior as flat transcript

### initiateOutboundCall()
- Returns `{ conversation_id, call_sid }` on success
- Makes POST request with phone number

### High-Impact: Transcript retry exhaustion
- All 5 retries fail (transcript not ready)
- Verify behavior: throws or returns empty — consumers should handle both

## TwilioClient

### createCall()
- Returns `{ success: true, callSid }` on success
- Returns `{ success: false, error }` on failure
- Calls correct Twilio API with user's phone number

### endCall()
- Marks call as completed via Twilio API
- Returns success/failure result

### generateStreamTwiml()
- Returns valid TwiML XML string
- Includes WebSocket stream URL and agent ID
- Audio format: 8000 Hz mulaw

### generateErrorTwiml()
- Returns TwiML with `<Say>` element containing error message
- Uses default message when none provided

### getCallInfo()
- Returns call status details (sid, to, from, status)

## PrismaDBClient

### Singleton
- `getInstance()` returns same instance
- `getClient()` returns underlying PrismaClient
- Exported `prismaClient` is the singleton

## RedisClient

### Singleton & Lifecycle
- `getInstance()` returns same instance
- `connect()` establishes connection, idempotent
- `disconnect()` gracefully closes

### Basic Operations
- `set()` stores string value, optional TTL via `EX` option
- `get()` returns string or null for missing key
- `setJSON()` serializes object and stores with optional TTL
- `getJSON()` deserializes and returns typed object or null

### Pattern Operations
- `getKeysByPattern()` returns all keys matching glob pattern
- `deleteByPattern()` deletes all matching keys, returns count

### Client Access
- `duplicate()` creates independent client
- `createSubscriber()` creates pub/sub subscriber client
- `getClient()` exposes raw Redis client

### High-Impact: Connection failures
- Operations called before `connect()` or after `disconnect()`
- Verify errors propagate cleanly to callers

## QdrantClient (test utility)

### postToCollection()
- Upserts vector points with payloads to Qdrant collection
- Lazily initializes collection (1536-dim, cosine distance) on first use

### searchCollection()
- Performs cosine similarity search filtered by userId
- Returns structured payloads with scores
- Default limit: 5 results

### Collection initialization
- Creates collection with correct vector config if not exists
- Creates userId keyword index

## Test Approach
- **OpenAI, ElevenLabs, Twilio:** Mock underlying SDK/API calls. Verify request format, retry behavior, error handling.
- **Redis:** Use mock or test Redis instance. Verify key formats, TTLs, serialization.
- **Prisma:** Verify singleton behavior only — repository tests cover actual queries.
- **Qdrant:** Verify request format and payload structure — used only for test data seeding.
