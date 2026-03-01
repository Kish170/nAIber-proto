# nAIber Proto
Voice-based AI companion for elderly care. Phone calls via Twilio → 
ElevenLabs → LangGraph persona graphs. Three call types: general 
conversation, health check, cognitive assessment.

## Call Flow
Twilio → server:3000 (WSS) → ElevenLabs ↔ llm-server:3001 
(SupervisorGraph → persona graph) → post-call via BullMQ

## Packages
| Package | Port | Role |
|---|---|---|
| `@naiber/server` | 3000 | Telephony — Twilio, ElevenLabs WSS, BullMQ dispatch |
| `@naiber/llm-server` | 3001 | AI — LangGraph, SupervisorGraph → persona graphs |
| `@naiber/scheduler-server` | — | Cron call scheduling (scaffold) |
| `@naiber/shared-core` | — | Types only: Prisma types, BullMQ contracts |
| `@naiber/shared-clients` | — | External clients (OpenAI, Twilio, Redis, Qdrant, etc.) |
| `@naiber/shared-data` | — | Repositories (Prisma) + stores (Redis) |
| `@naiber/shared-services` | — | Utilities (embeddings, text preprocessing) |

## Build Order
```
shared-core → shared-clients → shared-data → shared-services 
→ server / llm-server
```
Run `npm run build`. Each package uses `tsc --build` with project references.

## Critical Conventions
- ESM throughout — `"type": "module"`, `.js` extensions in imports
- LangGraph: use `graph: any` typing + `setEntryPoint()` (not 
  `addEdge(START, ...)`) to avoid TS strict type issues
- Pin `@langchain/langgraph-checkpoint` to `^1.0.0` (not `^1.0.1`)
- Prisma types generated to `generated/prisma/` at repo root
- Update docker-compose.yml when there is changes to the client's being used in each server

## Hard Rules
- System prompts live in `server/src/prompts/` — passed directly 
  over WSS to ElevenLabs, do NOT move them
- BullMQ queue schemas defined in `shared-core/types/queue-contracts.ts` 
  only — never define locally
- Do not change API contracts or endpoint signatures without discussion

## Reference Docs
Before starting work, check if any of these are relevant:

**Architecture**
- `docs/glossary.md` — terminology and concept disambiguation (read first if unsure about a term)
- `docs/arch/overview.md` — full system map: call flow, package roles, Redis keys, design rationale
- `docs/arch/server.md` — telephony layer deep dive (call lifecycle, prompts, session management)
- `docs/arch/llm-server.md` — AI orchestration deep dive (SupervisorGraph, persona graphs, RAG, post-call)
- `docs/arch/shared.md` — shared packages deep dive (dependency direction, what each layer owns)

**Personas / Product**
- `docs/prds/personas/general.md` — general conversation persona requirements and memory behaviour
- `docs/prds/personas/health.md` — health check persona requirements, Q&A flow, validation rules
- `docs/prds/personas/cognitive.md` — cognitive assessment design (placeholder — read before implementing)

**Decisions**
- `docs/decisions/adr-001-langgraph.md` — why LangGraph for AI orchestration
- `docs/decisions/adr-002-elevenlabs-routing.md` — why ElevenLabs calls llm-server directly
- `docs/decisions/adr-003-shared-split.md` — why shared code is split into 4 packages
- `docs/decisions/adr-004-bullmq-postcall.md` — why BullMQ for post-call processing

Each package has its own `CLAUDE.md` with module-specific context, gotchas, and dependency rules.