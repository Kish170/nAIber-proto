# ADR-008: General Persona RAG via MCP Tool Calling

**Status:** Revised — original decision superseded during implementation (see Implementation Outcome below)
**Date:** 2026-03-24 | **Revised:** 2026-04-24

## Context

The system currently routes all call types through our llm-server's `POST /v1/chat/completions` endpoint. ElevenLabs sends LLM requests here, and SupervisorGraph dispatches to the appropriate persona graph. This works well for health check and cognitive assessment, which require deterministic multi-turn flows with durable execution. But for general conversation, the LangGraph orchestration adds complexity without a structural benefit — the call is fundamentally free-form.

The general conversation pipeline today: SupervisorGraph → ConversationGraph → IntentClassifier → TopicManager → MemoryRetriever (Qdrant + KG enrichment) → response generation. This is a lot of machinery for "be a good conversationalist with memory."

Meanwhile, ElevenLabs supports MCP tool use — their built-in LLM can call external tools during conversation. This opens a path where the general persona uses ElevenLabs' LLM directly, with RAG exposed as a tool the LLM calls when it needs context.

## Original Decision (superseded)

**Proposed: Split orchestration by persona**

- **General calls** → ElevenLabs native LLM + MCP tool for RAG retrieval
- **Health check calls** → continue routing to llm-server for deterministic LangGraph flow
- **Cognitive calls** → continue routing to llm-server for deterministic LangGraph flow

## Implementation Outcome (2026-04-24)

**Actual implementation: custom LLM for all call types, MCP invoked by llm-server**

During implementation the ElevenLabs-native-LLM path was evaluated and rejected in favour of keeping custom LLM for general calls as well. The original proposal is retained above for context, but **the architecture described in "Proposed Architecture" below does not reflect what was built.** See "Actual Architecture" further down.

Reasons for diverging from the original decision:
- **`userId` reliability** — ElevenLabs does not include `conversation_id` in MCP tool call arguments. Without llm-server as the intermediary, reliably scoping `retrieveMemories` to the correct user requires passing `userId` through tool args, which the LLM controls and can get wrong. With the custom LLM path, llm-server injects `userId` from graph state before executing the tool — never from LLM args.
- **Debuggability** — All call types flowing through llm-server means a single place to observe, log, and trace tool calls. Two different LLM execution paths (ElevenLabs-native vs. custom) added operational complexity that outweighed the simplification benefit for a call type that was not yet proven stable.
- **Scoping** — The `retrieveMemories` tool schema intentionally omits `userId` to avoid the LLM hallucinating or leaking user IDs; this requires the execution layer to inject it. llm-server's `executeToolsNode` does this; ElevenLabs' native tool caller cannot.

The outcome is equivalent to the original intent — general calls use RAG via MCP — but the execution path differs.

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

## Actual Architecture

### During Call (All Types)

All call types route through llm-server via the custom LLM endpoint:

```
ElevenLabs → POST /v1/chat/completions → llm-server
  └── SupervisorGraph
        ├── General   → ConversationGraph (LangGraph)
        │     ├── agentNode: GPT-4o with RETRIEVE_MEMORIES_TOOL bound
        │     └── executeToolsNode: McpClient.retrieveMemories(query, userId)
        │                              → mcp-server /mcp → Qdrant + KG
        ├── Health    → HealthCheckGraph (deterministic, durable execution)
        └── Cognitive → CognitiveGraph (deterministic, durable execution)
```

The LLM decides when to call `retrieveMemories` via OpenAI function calling. `userId` is injected from graph state in `executeToolsNode` — never from LLM-generated args. Examples:
- User mentions a past event → LLM emits a tool call to retrieve related highlights
- User asks "do you remember when..." → LLM calls tool
- Casual small talk → LLM responds directly, no tool call emitted

Full user profile is injected into the system prompt by `server` at session start (`PromptInterface.buildUserContext`). No per-turn profile fetch is needed.

### During Call (Health / Cognitive) — unchanged

```
ElevenLabs → POST /v1/chat/completions → llm-server
  └── SupervisorGraph → HealthCheckGraph / CognitiveGraph (unchanged)
```

## Proposed Architecture (original — not implemented)

### During Call (General)

```
ElevenLabs built-in LLM
  ├── System prompt (via conversation_config_override)
  ├── User profile context (via dynamic_variables or prompt injection)
  └── MCP Tools:
        └── retrieveMemories(query) → Qdrant + KG enriched results
```

This path was not implemented. See Implementation Outcome above.

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

In the current WebSocket bridge, post-call is still triggered on WebSocket close (unchanged).

## Implementation Notes (2026-04-24)

- **`apps/llm-server/src/personas/general/ConversationGraph.ts`** — Revised (not removed). `ConversationGraph` is a two-node LangGraph loop: `agentNode` (GPT-4o with `RETRIEVE_MEMORIES_TOOL` bound) → `executeToolsNode` (calls `McpClient.retrieveMemories`). `IntentClassifier`, `TopicManager`, and `MemoryRetriever` graph nodes were removed; the LLM handles intent and retrieval timing.
- **`apps/llm-server/src/graphs/SupervisorGraph.ts`** — Still routes general calls to `ConversationGraph`. The `general_misrouted` fallback remains for safety but is no longer the expected general call path.
- **`apps/llm-server/src/clients/McpClient.ts`** — Executes `retrieveMemories(query, userId)` against **mcp-server** `/mcp`. `userId` injected from graph state, not from LLM-generated args.
- **`apps/mcp-server`** — MCP server exposes `retrieveMemories` and `getUserProfile` tools. Called by llm-server’s `McpClient`, not by ElevenLabs directly.
- **`apps/server/src/services/WebSocketService.ts`** — All call types use `conversation_config_override.agent.llm` with `type: "custom_llm"` pointing at llm-server. There is no general-call path that omits the `llm` override.
- **Topic drift** — Per-turn topic tracking removed; topic extraction remains in post-call (`GeneralPostCallGraph`). Accepted tradeoff.
- **`getUserProfile`** — Tool exists in MCP server and `McpClient` but is not called during live general turns. User profile is injected into the system prompt at session start via `PromptInterface.buildUserContext` in `server`.

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

## What Changed from the Original ConversationGraph

Removed from general call path:
- `IntentClassifier` — LLM handles intent and filler detection naturally via tool calling
- `MemoryRetriever` as a graph node — replaced by `executeToolsNode` calling MCP
- `TopicManager` per-turn state — topic detection moves to post-call only
- Redis `rag:topic:{conversationId}` per-turn cache — no longer needed

Kept / revised:
- **`ConversationGraph`** — retained as a two-node LangGraph loop (agent ↔ tools)
- **`SupervisorGraph`** — still routes all call types including general
- **`HealthCheckGraph / CognitiveGraph`** — unchanged
- **`GeneralPostCallGraph`** — unchanged
- **All post-call infrastructure** — BullMQ, PostCallWorker, KG population
- **RAG infrastructure** — Qdrant, KGRetrievalService, EmbeddingService (reached via mcp-server)

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
- Simpler general call path — `IntentClassifier`, `TopicManager`, and `MemoryRetriever` graph nodes removed
- RAG only called when needed (LLM judges relevance) vs every turn
- `userId` injection is safe and server-controlled — LLM args never influence which user's memories are fetched
- Single LLM execution path for all call types — easier to observe and debug
- All call types observable in one place (llm-server logs, Bull Board)

**Negative / Trade-offs:**
- Less control over when RAG is invoked — LLM may over/under-retrieve compared to rule-based threshold
- Per-turn topic tracking lost (moved to post-call only)
- General calls still add llm-server hop; the load reduction from the original proposal was not realised

## Relationship to Other ADRs

- **ADR-005 (WebSocket Bridge):** This migration would happen alongside the telephony simplification. Built-in Twilio integration + native LLM for general + custom endpoint for health/cognitive.
- **ADR-001 (LangGraph):** LangGraph remains justified for health/cognitive. This ADR narrows its scope to structured flows only.
- **ADR-002 (ElevenLabs Routing):** Health/cognitive calls route to llm-server via per-call `conversation_config_override`; general calls use ElevenLabs native LLM.

## When to Implement

Shipped 2026-04-02 (see Implementation notes). Telephony simplification in ADR-005 remains a separate future effort.

## References

- [ADR-005: WebSocket Bridge](./adr-005-websocket-bridge.md) — telephony migration plan
- [ADR-001: LangGraph](./adr-001-langgraph.md) — original LangGraph justification
- [ElevenLabs MCP Tool Use](https://elevenlabs.io/docs/eleven-agents/customization/tools/mcp)
- [ElevenLabs Conversation Config Override](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides)
