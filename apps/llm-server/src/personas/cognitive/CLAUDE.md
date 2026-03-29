# personas/cognitive/

Cognitive assessment persona — multi-turn conversational cognitive battery with durable execution, scoring, and longitudinal drift detection.

## Current State

Fully implemented. 12-task sequence: 3 wellbeing check-ins + 9 cognitive tasks with content rotation, NLP-based validation, domain scoring, and post-call baseline/drift analysis. Single unified loop with one interrupt node.

## Files

**Core:**
- `CognitiveGraph.ts` — Main LangGraph orchestrator. Unified loop: orchestrator → prompt_task → wait_for_input (interrupt) → evaluate_response → route_next → [prompt_task | finalize]. Handles all task types including wellbeing in a single flow.
- `CognitiveState.ts` — LangGraph state annotation: task progression, scores, delayed recall phases, wellbeing responses.
- `CognitiveHandler.ts` — Test initialization. Rotates word lists, digit sets, letters, abstraction pairs across sessions to prevent practice effects.

**Tasks:**
- `tasks/TaskDefinitions.ts` — Types, enums, interfaces (CognitiveTaskType, CognitiveDomain, TaskResponse, WellbeingResponse, TASK_SEQUENCE). WELLBEING tasks are positions 1-3, cognitive tasks 4-12. All tasks have a `prompt` field.
- `tasks/ContentRotation.ts` — Five word lists (A-E), three digit sets, three vigilance letter sets, three abstraction pair sets. Session-based rotation functions.
- `tasks/TaskValidation.ts` — Scoring/validation for all 9 cognitive task types using compromise NLP + LLM-based abstraction scoring.

**Scoring:**
- `scoring/ScoringEngine.ts` — Domain score computation (6 domains, weighted aggregation), stability index, fluency personal best tracking, baseline updates, drift detection. WELLBEING domain is not scored.

**Post-Call:**
- `post-call/CognitivePostCallState.ts` — State channels for post-call: task responses, domain scores, stability index, flags.
- `post-call/CognitivePostCallGraph.ts` — Post-call workflow: compute scores → persist results → update baseline → detect drift.

## Dependencies
- `@naiber/shared-data` (CognitiveRepository for persistence and baseline lookups)
- `@naiber/shared-clients` (OpenAIClient for abstraction scoring)
- `compromise` (NLP for task validation)
- `@langchain/langgraph` + `FixedShallowRedisSaver` (durable execution — see ADR-009)

## Gotchas
- Content rotation is session-index-based — `sessionIndex % N` selects word list, digit set, etc.
- Post-call graph reads domain scores from state channels (not `this`) — fixed in Phase 5A.
- CognitivePrompt.ts in server/src/prompts/ is still a placeholder — needs implementation.
- Thread ID format: `cognitive:{userId}:{conversationId}`
- Must use `FixedShallowRedisSaver` (not `ShallowRedisSaver`) to avoid async durability race — see ADR-009.
