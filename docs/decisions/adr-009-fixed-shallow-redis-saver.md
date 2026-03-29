# ADR-009: FixedShallowRedisSaver — Async Durability Race Condition

**Status:** Accepted
**Date:** 2026-03-26

## Context

Both the cognitive assessment and health check graphs use LangGraph's durable execution pattern with `ShallowRedisSaver` (ADR-007) as the checkpointer. Each graph runs a multi-turn loop: prompt a question, `interrupt()` to wait for the user's answer, resume on the next message, evaluate, and loop.

After a variable number of interrupt/resume cycles (typically 5-13), the graph would stop responding with real LLM output and instead return a hardcoded fallback ("Your mind exercise for this session is complete. Thank you!").

## Problem

### Root Cause

LangGraph's execution loop operates in `"async"` durability mode by default. In this mode, `checkpointer.put()` and `checkpointer.putWrites()` are dispatched as **independent, un-awaited promises** — they resolve at unpredictable times after the invoke returns.

`ShallowRedisSaver` stores a single checkpoint document per thread. It uses a `has_writes` flag on this document to control whether `getTuple()` loads pending writes (which contain interrupt data that determines `getState().next`).

Two interacting race conditions:

**Race 1: `put()` overwrites `has_writes`**
1. A node calls `interrupt()` → `putWrites()` saves interrupt data and sets `has_writes = "true"`
2. The loop's `put()` (from the preceding checkpoint save) then resolves and overwrites the document with `has_writes = "false"`

**Race 2: Interrupt writes not flushed**
With async durability, `finishAndHandleError()` does NOT call `_putCheckpoint()` or `_flushPendingWrites()`. Interrupt data relies entirely on the fire-and-forget `putWrites()` promise. When the next request arrives and calls `getState()`, this promise may not have resolved — the interrupt writes simply don't exist in Redis yet.

### Result

`getState().next` returns `[]`. The supervisor interprets this as "assessment complete" and returns the fallback message. All subsequent messages hit the same fallback since the checkpoint is now stuck without pending writes.

### Why It Worsens Over Time

The `put()` calls are chained via `_checkpointerChainedPromise` — each waits for the previous one. As the graph accumulates more steps, the chain grows longer, increasing the window where `put()` resolves after `putWrites()`. The `putWrites()` calls, being independent promises, don't participate in this chain, making the race increasingly likely to trigger.

### Evidence

Debug logging confirmed:
- Step counter accumulated across resumes: 2 → 6 → 10 → 14 → 18 → 21
- At the failing resume: `route_next` and `prompt_task` executed, but the interrupt at `wait_for_input` was not persisted to Redis
- Pending writes inspection showed prompt_task output (`taskStartTimestamp`, `branch:to:wait_for_input`) but NO `__interrupt__` channel — the interrupt writes were never flushed
- Serializing only `put()` calls extended the working range from ~7 to ~13 messages, confirming the race
- Serializing ALL operations (put + putWrites) through a single chain fully resolved the issue

## Decision

**Chosen: `FixedShallowRedisSaver` — serialize all checkpointer operations**

Created a wrapper class that chains all `put()` and `putWrites()` calls through a single serial promise (`_opChain`). Before reading state in `getTuple()`, it awaits this chain to ensure all writes have been flushed. It also always loads pending writes regardless of the `has_writes` flag.

```typescript
class FixedShallowRedisSaver extends ShallowRedisSaver {
    private _opChain = Promise.resolve();

    async put(...) {
        const result = this._opChain.then(() => super.put(...));
        this._opChain = result.catch(() => {});
        return result;
    }

    async putWrites(...) {
        const result = this._opChain.then(() => super.putWrites(...));
        this._opChain = result.catch(() => {});
        return result;
    }

    async getTuple(...) {
        await this._opChain;  // Drain pending writes before reading
        // ... always load pending writes regardless of has_writes
    }
}
```

### Why Not Other Approaches

- **`durability: "sync"`**: Awaits all promises at invoke end, but doesn't fix the internal ordering — `put()` and `putWrites()` still race within the batch.
- **Patching `put()` to preserve `has_writes`**: Doesn't fix Race 2 (writes not flushed before read).
- **Only fixing `getTuple`**: Loading writes always fixes Race 1, but Race 2 means writes may not exist yet.
- **Upstream PR**: Should be filed, but we need a working fix now.

### Trade-offs

- All checkpointer operations become serial per thread. Since each operation is a small Redis call (~1-5ms), this adds minimal latency.
- `loadPendingWrites()` always runs in getTuple (one extra `zRange` + N `json.get` calls). Negligible for our use case.

## Files Changed

- `apps/llm-server/src/checkpointers/FixedShallowRedisSaver.ts` — new file, wrapper class
- `apps/llm-server/src/index.ts` — uses `FixedShallowRedisSaver.create()` instead of `ShallowRedisSaver.fromUrl()`

## Consequences

**Positive:**
- Both cognitive and health check graphs can run unlimited interrupt/resume cycles
- No changes to graph logic, LangGraph internals, or node_modules required
- Fix is isolated to a single file, easy to remove if upstream fixes the issue
- Single shared checkpointer instance serves both graphs automatically

**Negative:**
- Slight serialization overhead per checkpointer operation (imperceptible in practice)
- Coupled to ShallowRedisSaver's internal API (field names, method signatures)

**Risks:**
- If `@langchain/langgraph-checkpoint-redis` changes ShallowRedisSaver internals, the wrapper may break. Pin the package version and test after upgrades.
