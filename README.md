# nAIber (AI Neighbor)
 A real-time, empathetic AI voice companion for elderly care, capable of remembering past conversations and conducting adaptive check-ins via phone.

## The Mission
Elderly isolation is a growing crisis. Apps are too complicated for many seniors. nAIber uses the most natural interface of all **the telephone** to provide companionship, medication reminders, and wellness checks using a voice that remembers them.

## System Architecture

The system handles **bi-directional audio streams** over WebSockets to minimize latency:

1. **Ingestion:** Twilio Media Streams capture raw audio from the PSTN (Phone network)
2. **Processing:** Audio is streamed to the Node.js backend via WebSockets
3. **Memory:** System queries **PostgreSQL** for user context and **Qdrant** for conversation highlights (RAG)
4. **Synthesis:** **ElevenLabs** generates human-like audio in real-time, streamed back to the caller
5. **Analysis:** Post-call processing extracts topics, deduplicates using embeddings, and updates vector memory

## Tech Stack

### Core Infrastructure
- **Runtime:** Node.js + TypeScript (Monorepo Architecture)
- **Telephony:** Twilio (Programmable Voice, Media Streams)
- **Protocol:** WebSockets (Real-time bi-directional streaming)
- **Session Management:** Redis (Active call tracking, 2hr TTL)

### AI & Memory Layer
- **Voice AI:** ElevenLabs Conversational AI
- **LLM:** OpenAI GPT-4 (System prompt generation, embeddings)
- **Vector Memory:** Qdrant (Conversation highlights with cosine similarity search)
- **Relational DB:** PostgreSQL + Prisma ORM (User profiles, health data, topics)

### Development Tools
- **Local Tunneling:** ngrok
- **Testing:** Twilio Media Stream Debugger

## Key Engineering Challenges

### 1. Handling Real-Time Latency
Voice conversation requires **sub-second response times**. Standard HTTP requests were too slow.

**Solution:**
- Implemented a **dual-architecture** approach:
  - **WebSocket Mode** (`CallController`): Full control over Twilio � ElevenLabs audio streams
  - **API Mode** (`CallController2`): Simplified flow using ElevenLabs native outbound API
- Utilized ElevenLabs' **streaming API** to begin playing audio before the full sentence is generated
- Redis-backed session management to track active calls without database overhead

**Result:** End-to-end latency under 800ms for natural conversation flow.

---

### 2. Long-Term Memory (RAG)
To feel like a "friend," the AI needs to remember details across weeks of conversations.

**Challenge:**
- How to recall "Sarah's grandson visited on Tuesday" 3 weeks later?
- How to avoid repeating the same topics?

**Solution:**
- **Post-Call Pipeline** (`PostCallController.ts`):
  1. ElevenLabs webhook delivers full transcript + analysis
  2. Extract key highlights and topics
  3. Generate embeddings via OpenAI
  4. **Topic Deduplication:** Compare new topics against existing using **cosine similarity** (0.85 threshold)
  5. Store highlights in **Qdrant** for semantic search
  6. Store topics in **PostgreSQL** with variations tracking

**Example Flow:**
```typescript
� PostCallService extracts topic: "family_grandson"
� Generates embedding: [0.234, 0.891, -0.123, ...]
� Compares against existing topics using cosine similarity
� If similar topic exists (>0.85): Add as variation
� If new: Create topic with reference to conversation
� Next call: SystemPrompt includes "Last time you mentioned your grandson's visit"
```

**Data Stored:**
- **PostgreSQL:** Structured data (topics, summaries, user profiles)
- **Qdrant:** Unstructured highlights for semantic search
- **Redis:** Ephemeral call sessions

### 3. Personalized Context Loading
Each call must feel like a continuation of a relationship, not a random bot.

**Solution:** Dynamic System Prompt Builder (`SystemPromptsService.ts`)
- **466-line comprehensive prompt** assembled per-call:
  - Core AI personality (warm, patient, non-judgmental)
  - User profile (age, interests, health conditions, medications)
  - Last 5 conversation summaries
  - Recent conversation topics
  - Emergency detection protocols
  - Health mention guidelines (passive tracking only)

**First Message Personalization:**
- Uses OpenAI to generate context-aware greetings
- Time-of-day awareness ("Good morning, Sarah!")
- References last conversation for returning users
- Warm introduction for first-time users

---

### 4. Webhook Security
ElevenLabs sends sensitive post-call data how to verify authenticity?

**Solution:** Cryptographic signature verification (`PostCallRoute.ts`)
```typescript
const signature = request.headers['elevenlabs-signature']
const timestamp = request.headers['elevenlabs-signature-timestamp']

if (Math.abs(currentTime - timestamp) > 300) throw new Error('Expired')

const expectedSignature = crypto
  .createHmac('sha256', ELEVENLABS_SIGNING_KEY)
  .update(timestamp + JSON.stringify(body))
  .digest('hex')

if (signature !== expectedSignature) throw new Error('Invalid signature')
```

---

## Implementation Status

###  Fully Implemented

#### Real-Time Voice Infrastructure
- [x] Bi-directional WebSocket audio streaming (Twilio � ElevenLabs)
- [x] Two calling architectures (WebSocket + API-based)
- [x] Session management with Redis
- [x] TwiML generation for media streaming
- [x] Webhook signature verification

#### AI & Memory
- [x] Vector memory with Qdrant (conversation highlights)
- [x] Topic extraction and deduplication via embeddings
- [x] PostgreSQL storage for user profiles, health data, medications
- [x] Dynamic system prompt generation (466 lines of context)
- [x] Personalized first message generation via OpenAI

#### Post-Call Processing
- [x] Transcript retrieval from ElevenLabs
- [x] Conversation summary storage
- [x] Topic extraction with cosine similarity matching (0.85 threshold)
- [x] Highlight embeddings stored in Qdrant
- [x] Topic-to-summary reference linking

#### Database Models
- [x] User profiles (demographics, preferences, call frequency)
- [x] Emergency contacts (relationship, notification preferences)
- [x] Health conditions (with severity tracking)
- [x] Medications (dosage, frequency)
- [x] Conversation summaries and topics
- [x] Call logs (status, outcome, retry logic)
- [x] Health logs (passive mentions)

---

### In Progress / Partial

- [ ] **Call Scheduling System:** Schema exists (preferredCallTime, callFrequency) but no automated queue/cron
- [ ] **Call Logging:** CallLog model defined but not actively populated during calls
- [ ] **Health Data Service:** Placeholder methods exist but not saving to database
- [ ] **LangChain Integration:** Code exists but not used (ElevenLabs now provides analysis)
- [ ] **Real-Time Vector Search:** Qdrant integrated but only queried post-call (not during conversation)

---

### Planned Features

- [ ] **Interruptibility:** Allow users to interrupt the AI mid-sentence (Barge-in detection)
- [ ] **Sentiment Analysis:** Detect distress in voice to alert caregivers
- [ ] **Automated Scheduling:** Cron-based queue system for daily/weekly check-ins
- [ ] **SMS Notifications:** Alert caregivers for 3 consecutive missed calls
- [ ] **Caregiver Dashboard:** Web UI for profile management and insights
- [ ] **Production Deployment:** Migration from ngrok to Railway/Render
- [ ] **Mid-Call Vector Retrieval:** "Tell me what we discussed about gardening" � Query Qdrant in real-time

---

## Setup (Local Dev)

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Redis instance
- Twilio account with phone number
- ElevenLabs API key + Agent ID
- OpenAI API key
- Qdrant instance (local or cloud)

### Installation

```bash
git clone <repository-url>
cd nAIber-proto

npm install

cp .env.example .env

npx prisma generate

npx prisma db push

ngrok http 3000

npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/naiber
DIRECT_URL=postgresql://user:password@localhost:5432/naiber

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890

# ElevenLabs
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_AGENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_SIGNING_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## =� License

Implemented by Kishan Rajagunathas

---

**Built with care for those who care** 

*Because everyone deserves a friend who remembers.*
