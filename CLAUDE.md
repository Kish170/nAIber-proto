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
| `@naiber/shared-services` | — | Utilities (embeddings, text preprocessing, user handler) |

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
- `docs/arch.md` — system architecture and persona design
- `docs/prd.md` — product requirements
- Each package has its own `CLAUDE.md` with module-specific context,
  gotchas, and dependency rules