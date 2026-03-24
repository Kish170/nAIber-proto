# ADR-008: Migrate General Persona to ElevenLabs Native LLM with RAG Tool

**Status:** Proposed (post-batch migration)
**Date:** 2026-03-24

## Context

The system currently routes all call types through our llm-server's `POST /v1/chat/completions` endpoint. ElevenLabs sends LLM requests here, and SupervisorGraph dispatches to the appropriate persona graph. This works well for health check and cognitive assessment, which require deterministic multi-turn flows with durable execution. But for general conversation, the LangGraph orchestration adds complexity without a structural benefit — the call is fundamentally free-form.

The general conversation pipeline today: SupervisorGraph → ConversationGraph → IntentClassifier → TopicManager → MemoryRetriever (Qdrant + KG enrichment) → response generation. This is a lot of machinery for "be a good conversationalist with memory."

Meanwhile, ElevenLabs supports MCP tool use — their built-in LLM can call external tools during conversation. This opens a path where the general persona uses ElevenLabs' LLM directly, with RAG exposed as a tool the LLM calls when it needs context.

## Decision

**Proposed: Split orchestration by persona**

- **General calls** → ElevenLabs native LLM + MCP tool for RAG retrieval
- **Health check calls** → continue routing to llm-server for deterministic LangGraph flow
- **Cognitive calls** → continue routing to llm-server for deterministic LangGraph flow

### Why General Is Different

Health check and cognitive assessment require:
- **Deterministic question ordering** — specific questions asked in sequence
- **Answer validation** — structured parsing of user responses
- **Durable execution** — interrupt/resume across many turns with checkpointed state
- **Completion detection** — programmatic call termination when all questions are answered

General conversation requires none of this. The LLM just needs to:
- Be a warm, patient companion (system prompt handles this)
- Access conversation history and user context when relevant (RAG tool)
- Avoid steering toward health/cognitive topics (system prompt handles this)

An LLM with a good system prompt and a RAG tool can do this without graph orchestration.

## Proposed Architecture

### During Call (General)

```
ElevenLabs built-in LLM
  ├── System prompt (via conversation_config_override)
  ├── User profile context (via dynamic_variables or prompt injection)
  └── MCP Tools:
        └── retrieveMemories(query) → Qdrant + KG enriched results
```

The LLM decides when to call `retrieveMemories` based on conversation context. For example:
- User mentions a past event → LLM calls tool to retrieve related highlights
- User asks "do you remember when..." → LLM calls tool
- Casual small talk → LLM responds directly, no tool call needed

### During Call (Health / Cognitive)

```
ElevenLabs → POST /v1/chat/completions → llm-server
  └── SupervisorGraph → HealthCheckGraph / CognitiveGraph (unchanged)
```

Routing between native LLM and custom endpoint controlled via `conversation_config_override`:
- General calls: use ElevenLabs default LLM (no `llm.url` override)
- Health/cognitive calls: set `llm.url` to point at llm-server endpoint

### After Call (All Types)

Post-call processing unchanged for all personas:
- General: GeneralPostCallGraph (transcript → summary → topics → embeddings → KG population)
- Health: HealthPostCallGraph (checkpoint → persist answers → delete thread)
- Cognitive: CognitivePostCallGraph (checkpoint → score → persist → delete thread)

Post-call is triggered by ElevenLabs webhook or MCP tool, not by WebSocket close event (since we'd be using the built-in Twilio integration per ADR-005 future plan).

## MCP RAG Tool Design

```
Tool: retrieveMemories
Input: { query: string }
Output: {
  highlights: [{ text, topic, similarity, source }],
  relatedTopics: [{ name, mentionCount }],
  persons: [{ name, relationship }]
}
```

Internally, this tool would:
1. Preprocess query via TextPreprocessor
2. Embed via EmbeddingService
3. Search Qdrant for similar highlights
4. Enrich via KGRetrievalService (topic traversal, related topics, persons)
5. Return structured context for the LLM to incorporate

This reuses the existing RAG infrastructure — just exposed as a tool instead of a graph node.

## What Gets Removed from llm-server (General Path)

- `ConversationGraph` — replaced by ElevenLabs native LLM
- `IntentClassifier` — LLM handles intent naturally
- `MemoryRetriever` as a graph node — becomes MCP tool
- General call routing in `SupervisorGraph` — no longer receives general call requests
- `TopicManager` per-turn state — topic detection moves to post-call only

## What Stays

- **SupervisorGraph** — still routes health/cognitive calls
- **HealthCheckGraph / CognitiveGraph** — unchanged, deterministic flows
- **GeneralPostCallGraph** — unchanged, still processes transcripts after call
- **All post-call infrastructure** — BullMQ, PostCallWorker, KG population
- **RAG infrastructure** — Qdrant, KGRetrievalService, EmbeddingService (exposed via MCP instead of graph node)
- **TopicManager** — used in post-call for topic extraction, no longer per-turn

## Open Questions

### Topic State Tracking
Currently `TopicManager` tracks topic drift per-turn during conversation. With the LLM calling RAG on-demand, we lose per-turn topic tracking. Options:
- Move topic tracking entirely to post-call (simpler, slightly less context-aware during call)
- Add a `trackTopic` MCP tool the LLM calls alongside RAG (adds complexity)
- Accept the tradeoff — post-call topic extraction from transcript is likely sufficient

### RAG Tool Latency
Currently RAG retrieval is inline in the graph — adds latency to every turn but is predictable. As an MCP tool, retrieval only happens when the LLM decides it's needed (fewer calls, but each adds a round-trip). Need to verify ElevenLabs MCP tool call latency is acceptable for conversational flow.

### Conversation History
Currently ConversationGraph receives full message history from ElevenLabs. With native LLM, ElevenLabs manages conversation history internally. The RAG tool only needs to supplement with long-term memory, not recent conversation context. Need to confirm ElevenLabs' native context window handling is sufficient.

### HIPAA / Zero-Retention
ElevenLabs MCP is not available in HIPAA-compliant or zero-retention modes (noted in ADR-005). If compliance requirements change, this migration may not be viable and the current architecture would need to be retained.

### LLM Model Choice
ElevenLabs supports multiple LLM providers (GPT-4o, Claude, Gemini). We'd need to evaluate which model best fits the companion persona. Currently we use GPT-4o — ElevenLabs supports this, so the transition could maintain the same model.

## Consequences

**Positive:**
- Significantly simpler general call path — no graph orchestration for free-form conversation
- Reduced llm-server load — general calls (likely the most frequent) bypass it entirely
- RAG only called when needed (LLM judges relevance) vs every turn
- Cleaner separation: structured flows (health/cognitive) use graphs, free-form (general) uses native LLM

**Negative / Trade-offs:**
- Less control over when RAG is invoked — LLM may over/under-retrieve
- Per-turn topic tracking lost (moved to post-call only)
- Two different LLM paths to maintain and debug
- MCP tool latency during conversation is an unknown
- Dependency on ElevenLabs MCP availability and reliability

## Relationship to Other ADRs

- **ADR-005 (WebSocket Bridge):** This migration would happen alongside the telephony simplification. Built-in Twilio integration + native LLM for general + custom endpoint for health/cognitive.
- **ADR-001 (LangGraph):** LangGraph remains justified for health/cognitive. This ADR narrows its scope to structured flows only.
- **ADR-002 (ElevenLabs Routing):** Currently ElevenLabs routes all LLM calls to our endpoint. Post-migration, only health/cognitive calls route to us.

## When to Implement

After all current batches are complete and the prototype is functionally stable. This is a post-batch migration alongside the telephony changes described in ADR-005.

## References

- [ADR-005: WebSocket Bridge](./adr-005-websocket-bridge.md) — telephony migration plan
- [ADR-001: LangGraph](./adr-001-langgraph.md) — original LangGraph justification
- [ElevenLabs MCP Tool Use](https://elevenlabs.io/docs/eleven-agents/customization/tools/mcp)
- [ElevenLabs Conversation Config Override](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides)
