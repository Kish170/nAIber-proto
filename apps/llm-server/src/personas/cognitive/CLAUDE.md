# personas/cognitive/

Cognitive assessment persona — multi-turn conversational cognitive battery with durable execution, scoring, and longitudinal drift detection.

## Current State

Fully implemented. 9-task cognitive assessment with content rotation, NLP-based validation, domain scoring, and post-call baseline/drift analysis.

## Files

**Core:**
- `CognitiveGraph.ts` — Main LangGraph orchestrator. Runs 9-task battery: orientation → word registration → digit span → serial 7s → letter vigilance/fluency → abstraction → delayed recall. Uses durable execution (interrupt/resume) via ShallowRedisSaver.
- `CognitiveState.ts` — LangGraph state annotation: wellbeing checks, task progression, scores, delayed recall phases.
- `CognitiveHandler.ts` — Test initialization. Rotates word lists, digit sets, letters, abstraction pairs across sessions to prevent practice effects.

**Tasks:**
- `tasks/TaskDefinitions.ts` — Types, enums, interfaces (CognitiveTaskType, CognitiveDomain, TaskResponse, WellbeingResponse, TASK_SEQUENCE).
- `tasks/ContentRotation.ts` — Five word lists (A-E), three digit sets, three vigilance letter sets, three abstraction pair sets. Session-based rotation functions.
- `tasks/TaskValidation.ts` — Scoring/validation for all 9 task types using compromise NLP + LLM-based abstraction scoring.

**Scoring:**
- `scoring/ScoringEngine.ts` — Domain score computation (6 domains, weighted aggregation), stability index, fluency personal best tracking, baseline updates, drift detection.

**Post-Call:**
- `post-call/CognitivePostCallState.ts` — State channels for post-call: task responses, domain scores, stability index, flags.
- `post-call/CognitivePostCallGraph.ts` — Post-call workflow: compute scores → persist results → update baseline → detect drift.

## Dependencies
- `@naiber/shared-data` (CognitiveRepository for persistence and baseline lookups)
- `@naiber/shared-clients` (OpenAIClient for abstraction scoring)
- `compromise` (NLP for task validation)
- `@langchain/langgraph` + `ShallowRedisSaver` (durable execution)

## Gotchas
- Content rotation is session-index-based — `sessionIndex % N` selects word list, digit set, etc.
- Post-call graph reads domain scores from state channels (not `this`) — fixed in Phase 5A.
- CognitivePrompt.ts in server/src/prompts/ is still a placeholder — needs implementation.
- Thread ID format: `cognitive:{userId}:{conversationId}`
