# Railway Deploy Runbook

**Status:** Ready to deploy once credentials are rotated.
**Target:** 5 Railway services — `web`, `api`, `mcp-server`, `server`, `llm-server`.

---

## Pre-deploy checklist (D5 — rotate credentials)

Before deploying publicly, rotate these credentials and update Railway env vars:

| Credential | Provider | Action |
|---|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API Keys | Generate new, revoke old |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile → API Keys | Generate new, revoke old |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | console.twilio.com → Account → Auth tokens | Roll auth token |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | — | `openssl rand -base64 32` to generate |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | console.cloud.google.com | Create new OAuth 2.0 credentials for the Railway domain |
| `NEO4J_PASSWORD` | Neo4j Aura console | Change password |
| `.env` file | repo root | **Delete** or add to `.gitignore` before pushing — currently has real keys |

---

## D4 — Register llm-server as ElevenLabs custom-LLM endpoint

1. Go to elevenlabs.io → Conversational AI → your agent
2. In the agent settings, find **Custom LLM**
3. Set the URL to: `https://<llm-server-railway-url>/v1/chat/completions`
   - Replace `<llm-server-railway-url>` with the Railway public URL for `llm-server`
4. Save the agent
5. Verify with one test call — check Railway logs for `[LLM Server]` output

---

## D3 — Static Twilio webhook URL

Once `server` is deployed on Railway:

1. Copy the Railway public URL for `server` (e.g. `https://naiber-server.up.railway.app`)
2. Set these Railway env vars on the `server` service:
   ```
   USE_DYNAMIC_NGROK=false
   BASE_URL=https://naiber-server.up.railway.app
   TWILIO_URL=https://naiber-server.up.railway.app
   STREAM_URL=wss://naiber-server.up.railway.app/outbound-media-stream
   ```
3. In [Twilio console](https://console.twilio.com) → Phone Numbers → your number → Voice & Fax:
   - Set **A call comes in** webhook to: `https://naiber-server.up.railway.app/twiml`
   - HTTP method: `POST`
4. Redeploy `server` service to pick up new env vars

---

## Railway service setup (D7)

### 1. Create Railway project

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
```

Or use the Railway dashboard at railway.app → New Project → Deploy from GitHub repo.

### 2. Service configuration

Create **5 services** from the same GitHub repo, each pointing to a different Dockerfile:

| Service name | Dockerfile | Root directory |
|---|---|---|
| `web` | `apps/web/Dockerfile` | `.` (repo root) |
| `api` | `apps/api/Dockerfile` | `.` (repo root) |
| `server` | `apps/server/Dockerfile` | `.` (repo root) |
| `llm-server` | `apps/llm-server/Dockerfile` | `.` (repo root) |
| `mcp-server` | `apps/mcp-server/Dockerfile` | `.` (repo root) |

Each service has a `railway.toml` in its directory that sets the Dockerfile path.

### 3. Add managed plugins

- **Postgres** plugin → connect to `api`, `server`, `llm-server`, `mcp-server`, `web`
- **Redis** plugin → connect to `server`, `llm-server`, `mcp-server`

Copy the connection strings into each service's `DATABASE_URL` and `REDIS_URL` env vars.

> Note: Supabase Postgres is already provisioned. Use its connection string (`DATABASE_URL` / `DIRECT_URL`) instead of a Railway Postgres plugin if preferred.

### 4. Environment variables per service

#### `web`
```
NODE_ENV=production
NEXTAUTH_URL=https://<web-railway-url>
AUTH_SECRET=<rotated>
AUTH_GOOGLE_ID=<rotated>
AUTH_GOOGLE_SECRET=<rotated>
DEMO_AUTH_ENABLED=true
DEMO_USER_EMAIL=<email from seed-demo.ts>
DEMO_USER_PASSWORD=<password from seed-demo.ts>
DATABASE_URL=<supabase>
DIRECT_URL=<supabase-direct>
NEXT_PUBLIC_API_URL=https://<api-railway-url>
NEXT_PUBLIC_TELEPHONY_URL=https://<server-railway-url>
FRONTEND_URL=https://<web-railway-url>
```
Build args (in Railway → Settings → Build → Variables):
```
NEXT_PUBLIC_API_URL=https://<api-railway-url>
NEXT_PUBLIC_TELEPHONY_URL=https://<server-railway-url>
```

#### `api`
```
NODE_ENV=production
API_PORT=3002
DATABASE_URL=<supabase>
DIRECT_URL=<supabase-direct>
AUTH_SECRET=<rotated>
FRONTEND_URL=https://<web-railway-url>
```

#### `server`
```
NODE_ENV=production
PORT=3000
PHONE_NUMBER=<target phone number>
USE_DYNAMIC_NGROK=false
BASE_URL=https://<server-railway-url>
TWILIO_URL=https://<server-railway-url>
STREAM_URL=wss://<server-railway-url>/outbound-media-stream
TWILIO_ACCOUNT_SID=<rotated>
TWILIO_AUTH_TOKEN=<rotated>
TWILIO_NUMBER=<twilio number>
ELEVENLABS_API_KEY=<rotated>
ELEVENLABS_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_AGENT_ID=<agent id>
ELEVENLABS_NUMBER_ID=<number id>
ELEVENLABS_VOICE_ID=<voice id>
ELEVENLABS_MODEL_ID=<model id>
ELEVENLABS_AUDIO_FORMAT=ulaw_8000
ELEVENLABS_SAMPLE_RATE=8000
ELEVENLABS_CUSTOM_LLM_URL=https://<llm-server-railway-url>/v1/chat/completions
OPENAI_API_KEY=<rotated>
OPENAI_BASE_URL=https://api.openai.com/v1
DATABASE_URL=<supabase>
DIRECT_URL=<supabase-direct>
QDRANT_API_KEY=<qdrant>
QDRANT_URL=<qdrant cloud url>
QDRANT_COLLECTION=<collection name>
REDIS_URL=<railway redis url>
FRONTEND_URL=https://<web-railway-url>
```

#### `llm-server`
```
NODE_ENV=production
PORT=3001
OPENAI_API_KEY=<rotated>
OPENAI_BASE_URL=https://api.openai.com/v1
QDRANT_API_KEY=<qdrant>
QDRANT_URL=<qdrant cloud url>
QDRANT_COLLECTION=<collection name>
REDIS_URL=<railway redis url>
ELEVENLABS_API_KEY=<rotated>
ELEVENLABS_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_AGENT_ID=<agent id>
ELEVENLABS_NUMBER_ID=<number id>
TWILIO_ACCOUNT_SID=<rotated>
TWILIO_AUTH_TOKEN=<rotated>
TWILIO_NUMBER=<twilio number>
DATABASE_URL=<supabase>
DIRECT_URL=<supabase-direct>
NEO4J_URI=<neo4j aura uri>
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<rotated>
NEO4J_DATABASE=neo4j
LANGCHAIN_API_KEY=<langsmith key if using>
LANGCHAIN_TRACING_V2=false
MCP_SERVER_URL=https://<mcp-server-railway-url>
```

#### `mcp-server`
```
NODE_ENV=production
MCP_PORT=3002
OPENAI_API_KEY=<rotated>
OPENAI_BASE_URL=https://api.openai.com/v1
QDRANT_API_KEY=<qdrant>
QDRANT_URL=<qdrant cloud url>
QDRANT_COLLECTION=<collection name>
REDIS_URL=<railway redis url>
NEO4J_URI=<neo4j aura uri>
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<rotated>
NEO4J_DATABASE=neo4j
DATABASE_URL=<supabase>
DIRECT_URL=<supabase-direct>
TWILIO_ACCOUNT_SID=<rotated>
TWILIO_AUTH_TOKEN=<rotated>
RAG_MEMORY_SIMILARITY_THRESHOLD=0.45
LANGCHAIN_API_KEY=<langsmith key if using>
LANGCHAIN_TRACING_V2=false
```

### 5. Deploy order

Deploy in this order to ensure dependencies are ready:
1. `mcp-server` (no deps on other services at startup)
2. `api` (no deps on other services)
3. `llm-server` (depends on `mcp-server` URL at runtime)
4. `server` (depends on `llm-server` URL for `ELEVENLABS_CUSTOM_LLM_URL`)
5. `web` (depends on `api` URL and `server` URL)

### 6. Smoke test — Demo Path 1 (synthetic user)

1. Open `https://<web-railway-url>/login`
2. Enter demo credentials (email/password from `prisma/seed-demo.ts`)
3. Verify dashboard loads with Margaret's data: call history, stability chart, domain trends, health overview, IQCODE card, notification flags
4. Go to Profile → "Initiate call" → click **General call**
5. Wait for the synthetic user's phone to ring
6. Complete the call and hang up
7. After ~30s, refresh `/sessions` — verify a new `GENERAL` call log appears
8. Click into the session — verify summary populated

### 7. Smoke test — Demo Path 2 (new user onboarding)

1. Log in as the demo caregiver
2. Go to `/onboarding/0` and complete all 7 steps for a new elderly profile
3. On Profile page, click **General call**
4. Complete the call
5. Verify post-call data lands in `/sessions`

---

## Rollback

If deployment fails:
- Railway keeps the previous deployment — click **Rollback** in the Railway dashboard
- To revert env vars, use Railway's history view

---

## .env cleanup (DP-6)

The `.env` file at repo root currently has real credentials checked in. Before any public GitHub access:

```bash
# Add to .gitignore
echo ".env" >> .gitignore
git rm --cached .env
git commit -m "chore: remove .env from git tracking"
```

Then add `.env.example` with placeholder values.
