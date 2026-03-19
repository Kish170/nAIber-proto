# ADR-007: Switch from RedisSaver to ShallowRedisSaver

**Status:** Accepted
**Date:** Prototype phase, 2025

## Context

Health check and cognitive assessment graphs use LangGraph's durable execution pattern — the graph pauses (`interrupt()`) to wait for user input, then resumes on the next turn. This requires a checkpointer to persist graph state between turns.

The initial implementation used `RedisSaver` from `@langchain/langgraph-checkpoint-redis`.

## Problem

`RedisSaver` had a bug where updating the thread state (via `Command({ resume, update })`) would reset all state channels except the ones being explicitly updated. This meant:
- Resuming a health check to record an answer would lose previously collected answers
- Updating one field would wipe the rest of the checkpoint state

This made multi-turn flows unusable — each resume effectively started from scratch except for the newly provided data.

## Decision

**Chosen: Switch to `ShallowRedisSaver`**

`ShallowRedisSaver` (from `@langchain/langgraph-checkpoint-redis/shallow`) correctly handles partial updates — it persists the full state and only modifies the channels specified in the update. Previous state is preserved across resumes.

## Consequences

**Positive:**
- Multi-turn durable execution works correctly — health check answers and cognitive task responses accumulate across turns
- Post-call workers can read complete checkpoint state (all answers, all task responses) after the call ends
- Thread cleanup (`deleteThread()`) works as expected

**Negative / Trade-offs:**
- `ShallowRedisSaver` stores only the latest checkpoint (no history) — cannot replay or roll back to earlier states within a thread. This is acceptable for our use case since we only need the final state for post-call processing.
- Import path differs: `@langchain/langgraph-checkpoint-redis/shallow` vs `@langchain/langgraph-checkpoint-redis`
