# @naiber/scheduler-server

Cron-based call scheduling service. Currently a scaffold — no implementation yet.

## Intended Purpose

- `cron/QueuePopulator.ts` — Scheduled job to enqueue outbound calls (health check-ins, companionship calls).
- `workers/QueueProcessor.ts` — Process scheduled call queue and trigger calls via Twilio.

## What It Does NOT Own

- No telephony logic (delegated to `@naiber/server` via Twilio).
- No LLM orchestration.

## Status

Empty scaffold. Files exist but contain no implementation.
