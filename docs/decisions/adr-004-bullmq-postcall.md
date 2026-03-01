# ADR-004: Use BullMQ for Post-Call Processing

**Status:** Accepted
**Date:** Prototype phase, 2025

## Context

When a call ends, several slow, failure-prone operations need to happen:

- **General calls:** Create a conversation summary, extract topics via NLP, generate and upsert embeddings into Qdrant.
- **Health check calls:** Read checkpoint state, persist structured health answers to the database, delete the checkpoint thread.

These operations can take several seconds and may fail (OpenAI API errors, DB timeouts, Qdrant unavailability). They must not block the call ending — the ElevenLabs WebSocket close should complete immediately regardless of whether post-call processing succeeds.

A 3-second delay is also required after the call ends to allow ElevenLabs to finalize the conversation transcript before the worker reads it.

## Considered Options

| Option | Notes |
|---|---|
| **BullMQ (chosen)** | Redis-backed job queue; retries, backoff, monitoring dashboard, deduplication |
| **Direct async (fire-and-forget)** | `processPostCall()` called asynchronously after WebSocket close, no queue |

## Decision

**Chosen: BullMQ**

BullMQ was the natural fit given Redis was already a runtime dependency for session management and LangGraph checkpointing. There was no justification for introducing a separate infrastructure component (SQS, RabbitMQ) when the existing Redis instance could serve as the queue backend.

The primary reason to use a queue at all rather than direct async processing:

- **Reliability.** A fire-and-forget async call dies with the process. If `server` restarts or crashes between the WebSocket close and the completion of post-call processing, the work is silently lost. BullMQ persists the job to Redis — it survives process restarts and will be retried automatically.
- **Retry logic.** Post-call operations depend on external services (OpenAI, Qdrant, Prisma). Transient failures should be retried with backoff, not dropped. BullMQ provides this without custom retry logic.
- **Observability.** The Bull Board dashboard at `/admin/queues` gives visibility into job state, failure reasons, and retry history during development and debugging.
- **Decoupling.** `server` is the producer; `llm-server` is the consumer. Neither needs to know about the other's internals — they share only the `PostCallJobData` contract defined in `@naiber/shared-core`.

## Consequences

**Positive:**
- Post-call failures are retried automatically (3 attempts, exponential backoff starting at 1s).
- Process restarts on either service do not lose pending post-call jobs.
- `server` and `llm-server` are decoupled — the queue is the only interface between them for post-call work.
- Queue monitoring available at `/admin/queues` without additional tooling.

**Negative / Trade-offs:**
- Redis is now load-bearing for three distinct concerns: session state, LangGraph checkpoints, and the job queue. A Redis outage affects all three simultaneously.
- The 3s dispatch delay (to allow transcript readiness) is a heuristic — if ElevenLabs takes longer than 3s to finalize a transcript, the post-call worker may read an incomplete one. There is no signal from ElevenLabs confirming transcript readiness.
- `PostCallWorker` runs at concurrency 1, rate-limited to 3 jobs/60s. Under high call volume this introduces a processing backlog. Acceptable for current scale but worth revisiting as call volume grows.
