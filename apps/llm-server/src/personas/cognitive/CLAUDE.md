# personas/cognitive/

Cognitive assessment persona — multi-turn conversational cognitive battery with durable execution, scoring, and longitudinal drift detection.

## Current State

Refactored into thin-node graph + 3 services (mirrors Health pattern). 11 active tasks (letter vigilance commented out). Intent classification via Health's IntentClassifier (rules → LLM fallback).

## Architecture

```
CognitiveGraph.ts (~140 lines, 6 thin nodes)
  ├── CognitiveAnswerInterpreter.ts — IntentClassifier (ANSWERING/ASKING/REFUSING) + per-task scoring via TaskValidation.ts
  ├── CognitiveDecisionEngine.ts — deterministic routing, state advancement, multi-turn logic, intent handling
  └── TaskContextBuilder.ts — pure string prompt construction, per-task + clarification builders
```

### Graph Flow
```
orchestrator → present_task → wait_for_input (interrupt) → interpret_answer → evaluate_and_decide
                    ↑                                                               │
                    └──────── (stay / clarify) ─────────────────────────────────────┘
                                                                                    │
                                                                      (advance / skip / defer)
                                                                                    ↓
                                                           present_task ← (index++)
                                                                                    │
                                                              (no tasks remain OR defer)
                                                                                    ↓
                                                                         finalize → END
```

### Decision Actions
- `advance` — record response, move to next task
- `stay` — multi-turn continuation (digit span trials, delayed recall phases, word registration retry)
- `clarify` — user asked for clarification, re-present task with simpler wording
- `skip` — user refused task or no interpretation available, record null-score response
- `defer` — session deferred (distress or explicit exit)

## Files

**Core (graph + services):**
- `CognitiveGraph.ts` — 6 thin nodes delegating to services. Constructor: `new CognitiveGraph(openAIClient, checkpointer)`.
- `CognitiveAnswerInterpreter.ts` — Intent classification (reuses `health/validation/IntentClassifier.ts`) + task-specific scoring dispatch.
- `CognitiveDecisionEngine.ts` — All routing decisions, state advancement, multi-turn mechanics. One public method: `evaluate(state, interpretation)`.
- `TaskContextBuilder.ts` — Pure string prompt construction. Per-task private builders + clarification variant.
- `CognitiveState.ts` — LangGraph state annotation: 35+ fields with `keep()` reducer (last-write-wins).
- `CognitiveHandler.ts` — Test initialization. Rotates word lists, digit sets, letters, abstraction pairs across sessions.

**Tasks:**
- `tasks/TaskDefinitions.ts` — Types, enums, interfaces (CognitiveTaskType, CognitiveDomain, TaskResponse, WellbeingResponse, TASK_SEQUENCE). 11 active tasks (LETTER_VIGILANCE commented out).
- `tasks/ContentRotation.ts` — Five word lists (A-E), three digit sets, three abstraction pair sets. Session-based rotation.
- `tasks/TaskValidation.ts` — Scoring/validation for all cognitive task types using compromise NLP + LLM-based abstraction scoring.

**Scoring:**
- `scoring/ScoringEngine.ts` — Domain score computation (6 domains, weighted aggregation), stability index, fluency personal best, baseline updates, drift detection.

**Post-Call:**
- `post-call/CognitivePostCallState.ts` — State channels for post-call pipeline.
- `post-call/CognitivePostCallGraph.ts` — Pipeline: compute scores → persist results → update baseline → detect drift.

## Dependencies
- `@naiber/shared-data` (CognitiveRepository for persistence and baseline lookups)
- `@naiber/shared-clients` (OpenAIClient for abstraction scoring)
- `compromise` (NLP for task validation)
- `@langchain/langgraph` + `FixedShallowRedisSaver` (durable execution — see ADR-009)
- Reuses `health/validation/IntentClassifier.ts` and `health/validation/ExtractionSchemas.ts`

## Gotchas
- Content rotation is session-index-based — `sessionIndex % N` selects word list, digit set, etc.
- Post-call graph reads domain scores from state channels (not `this`) — fixed in Phase 5A.
- Thread ID format: `cognitive:{userId}:{conversationId}`
- Must use `FixedShallowRedisSaver` (not `ShallowRedisSaver`) — see ADR-009.
- `LETTER_VIGILANCE` commented out of TASK_SEQUENCE — requires MCP tool for real-time detection.
- Abstraction is the only task with an async LLM call in the interpreter (via `validateAbstraction()`).