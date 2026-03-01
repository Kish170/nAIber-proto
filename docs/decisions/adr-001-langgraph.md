# ADR-001: Use LangGraph for AI Orchestration

**Status:** Accepted
**Date:** Prototype phase, 2025

## Context

The AI orchestration layer needs to handle two meaningfully different call types:

1. **General conversation** — a multi-step pipeline with conditional branching: classify intent → optionally manage topic state → optionally retrieve RAG memories → generate response. The branching logic is non-trivial and changes per turn.

2. **Health check** — a structured, multi-turn question-answer loop that must maintain state (current question index, collected answers, retry count) across many separate HTTP requests. Each request is stateless at the transport level (ElevenLabs sends a fresh `POST /v1/chat/completions` per turn), so state must be externally durable.

A third concern: the system is designed to add more call types (cognitive assessment, others) over time. The orchestration framework needs to accommodate new persona graphs without restructuring existing ones.

## Considered Options

| Option | Notes |
|---|---|
| **LangGraph** | Graph-based framework with native interrupt/resume (durable execution), Redis checkpointer support, and a composable node model |
| **Chained async functions** | Simple sequential calls: `classify() → retrieveMemories() → generateResponse()` |
| **Custom state machine** | Hand-rolled turn state stored in Redis, functions read/write state manually |

## Decision

**Chosen: LangGraph**

Two problems pushed equally toward a proper framework rather than simpler alternatives:

- **Durable execution (health check):** The interrupt/resume pattern with a Redis checkpointer (`ShallowRedisSaver`) solves multi-turn state persistence cleanly. A custom solution would have required hand-rolling the same pattern — storing state in Redis per turn, handling resume logic, managing thread IDs. LangGraph provides this out of the box and makes post-call answer retrieval trivial (read directly from checkpoint state).

- **Conditional branching (conversation graph):** The RAG pipeline has multiple conditional paths per turn (skip RAG entirely, use cached memories, run fresh vector search). Chained async functions handle linear pipelines but become hard to reason about when branches multiply. LangGraph's node + conditional edge model makes the branching explicit and testable.

A third factor: persona scalability. New call types map directly to new `StateGraph` instances under `SupervisorGraph`. The pattern is consistent and doesn't require restructuring existing graphs when adding a new persona.

## Consequences

**Positive:**
- Health check durable execution is solved at the framework level — no custom Redis state management needed.
- Adding a new persona graph is a self-contained change (new folder under `personas/`, new route in `SupervisorGraph`).
- Post-call workers can read health check answers directly from checkpoint state.

**Negative / Trade-offs:**
- `@langchain/langgraph-checkpoint` must be pinned to `^1.0.0`. Version `^1.0.1` introduces breaking changes incompatible with `@langchain/langgraph@1.0.1`. This must be managed carefully on upgrades.
- LangGraph's TypeScript types for `StateGraph` node names are strict in ways that conflict with our build. Workaround: use `graph: any` typing and `setEntryPoint()` instead of `addEdge(START, ...)`. This is a known limitation, not a bug.
- Debugging requires understanding the graph execution model — not immediately obvious to engineers unfamiliar with LangGraph.
