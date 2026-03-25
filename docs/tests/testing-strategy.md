# Testing Strategy

## Scope

Test the core AI pipeline now: **ai-orchestration**, **knowledge graph**, and **personas** (general, health, cognitive).

Defer until after MCP migration (ADR-005): telephony, shared clients, infrastructure, scheduler, web.

## Three Test Layers

### Layer 1: ElevenLabs E2E Smoke Test

**Tool:** `scripts/text-test.ts` (existing)
**What it proves:** The full pipeline connects — ElevenLabs → llm-server → persona graph → post-call processing → data persisted.

**Scope:**
- Connection: ElevenLabs session starts, Redis session created
- Routing: SupervisorGraph routes to correct persona
- Conversation: AI responds coherently to scripted messages
- Post-call: BullMQ job completes, data lands in Postgres/Neo4j

**Explicitly NOT responsible for:**
- Verifying which retrieval source provided context (that's Layer 3)
- Testing individual graph nodes or scoring logic (that's Layer 2)
- Testing edge cases or error paths (that's Layer 2)
- Conversation quality evaluation

**One test per call type.** Keep scenarios short (5-8 messages). The goal is "did it break?" not "is it correct?"

---

### Layer 2: Direct llm-server Integration Tests

**Tool:** Vitest + direct HTTP calls to `POST /v1/chat/completions`
**What it proves:** Individual components work correctly with real dependencies (Redis, Postgres, Neo4j, Qdrant, OpenAI).

**Scope:**
- **AI Orchestration:** SupervisorGraph routing, ConversationResolver primary path, durable execution (interrupt/resume), post-call job processing
- **Knowledge Graph:** Population creates correct Neo4j nodes/relationships, retrieval returns enriched results, two-stream merge/rerank works
- **Personas:**
  - General: ConversationGraph node traversal, intent classification, RAG retrieval integration, topic management
  - Health: HealthCheckGraph durable Q&A flow, answer validation (NLP + LLM), question sequencing, follow-up logic
  - Cognitive: CognitiveGraph 9-task battery, content rotation, task validation/scoring, domain score computation, baseline/drift detection

**How it differs from Layer 1:**
- Calls llm-server directly (no ElevenLabs in the loop)
- Can inspect response metadata, not just the text output
- Can set up specific preconditions (seed specific data, pre-populate Neo4j)
- Can test error paths and edge cases
- Fast iteration — no ElevenLabs latency

**Test approach:**
- Each test sets up its own state (Redis session, DB records) and tears it down
- Tests against the running Docker stack (real Redis, Postgres, Neo4j, Qdrant)
- Not unit tests — these are integration tests with real services

---

### Layer 3: LangSmith Observability

**Tool:** LangSmith tracing (`LANGCHAIN_TRACING_V2=true`)
**What it proves:** RAG attribution, graph execution flow, LLM input/output quality.

**Scope:**
- Which retrieval source provided each context chunk (Qdrant, KG discovery, both)
- What the LLM actually received as input (full prompt with context)
- How each graph node executed (timing, inputs, outputs)
- Token usage per call
- Conversation quality patterns over time

**Explicitly NOT a test runner.** LangSmith is observability — it doesn't pass/fail. It answers "what happened?" so you can debug issues found by Layer 1 or 2, and monitor quality over time.

**Setup:** Enable `LANGCHAIN_TRACING_V2=true` + `LANGCHAIN_API_KEY` in llm-server env. Zero code changes to the pipeline — LangGraph auto-traces.

---

## Layer Responsibility Matrix

| Component | Layer 1 (E2E Smoke) | Layer 2 (Integration) | Layer 3 (LangSmith) |
|---|---|---|---|
| **SupervisorGraph routing** | Implicit (correct persona responds) | Explicit (test each route) | Trace node execution |
| **ConversationResolver** | Implicit (call works) | Explicit (primary path only, no fallback) | — |
| **Durable execution** | Implicit (health/cognitive complete) | Explicit (interrupt, resume, complete states) | Trace checkpoint operations |
| **Post-call processing** | Verify data persisted | Test each graph (general/health/cognitive) | Trace graph execution |
| **KG population** | Verify Neo4j nodes exist | Test node/relationship creation, edge cases | — |
| **KG retrieval** | — | Test two-stream retrieval, merge, rerank | Trace retrieval sources |
| **RAG pipeline** | — | Test Qdrant search + KG enrichment integration | Trace context attribution |
| **Intent classification** | — | Test RAG trigger decisions | — |
| **Health Q&A flow** | Implicit (conversation completes) | Test question sequencing, validation, retries | Trace per-question flow |
| **Cognitive battery** | Implicit (conversation completes) | Test task progression, scoring, content rotation | Trace per-task flow |
| **Scoring engine** | — | Test domain scoring, stability index, drift detection | — |
| **Baseline/drift** | — | Test baseline creation, update, drift thresholds | — |

## What's Deferred

| Area | When | Why |
|---|---|---|
| Telephony | After MCP migration (ADR-005) | Architecture changing significantly |
| Shared clients | After MCP migration | Low risk, supporting infrastructure |
| Infrastructure | After MCP migration | Docker, Redis keys, DB schema — stable |
| Scheduler | After implementation + MCP migration | Empty scaffolds, not yet built |
| Web API/frontend | After MCP migration | Not core feature |

## PRDs and Test Specs to Write

The following PRDs and test specs need content (currently empty TODOs). Each test spec should map assertions to the layer responsible.

**Knowledge Graph:**
- `prds/knowledge-graph/population.md` → `tests/knowledge-graph/population.test.md`
- `prds/knowledge-graph/retrieval.md` → `tests/knowledge-graph/retrieval.test.md`
- `prds/knowledge-graph/schema.md` → `tests/knowledge-graph/schema.test.md`

**General Persona:**
- `prds/personas/general/conversation.md` → `tests/personas/general/conversation.test.md`
- `prds/personas/general/rag-pipeline.md` → `tests/personas/general/rag-pipeline.test.md`
- `prds/personas/general/post-call.md` → `tests/personas/general/post-call.test.md`

**Health Persona:**
- `prds/personas/health/post-call.md` → `tests/personas/health/post-call.test.md`
- (health-check.test.md — needs PRD; currently only top-level `prds/personas/health.md` exists)

**Cognitive Persona:**
- `prds/personas/cognitive/assessment.md` → `tests/personas/cognitive/assessment.test.md`
- `prds/personas/cognitive/scoring.md` → `tests/personas/cognitive/scoring.test.md`
- `prds/personas/cognitive/baseline-drift.md` → `tests/personas/cognitive/baseline-drift.test.md`
- `prds/personas/cognitive/post-call.md` → `tests/personas/cognitive/post-call.test.md`

## Implementation Order

1. **This doc** (testing strategy) — done
2. **LangSmith setup** — enable tracing in llm-server, verify traces appear (quick win, zero code changes)
3. **PRDs** for focus areas — fill in the empty TODOs based on current implementation
4. **Test specs** — fill in mapped to the 3-layer approach
5. **E2E smoke test improvements** — add post-call to scripted mode, update scenarios
6. **Layer 2 integration tests** — install vitest, write tests per spec
