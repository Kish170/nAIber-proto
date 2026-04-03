# Health Check — Implementation Details

## Purpose
Supplements the [top-level health check PRD](../health.md) with implementation-specific details for `HealthCheckGraph`, question definitions, and validation tools.

## Graph Nodes
1. **orchestrator** — initializes questions from database via `HealthCheckHandler`
2. **ask_question** — generates conversational question prompt via LLM
3. **wait_for_answer** — interrupts graph for user response (durable checkpoint)
4. **validate_answer** — validates answer format against question type
5. **check_follow_up** — optionally generates contextual follow-up (max 2)
6. **finalize** — completes health check, sets `isHealthCheckComplete: true`

## Question Initialization (HealthCheckHandler)

**Static base questions (always included):**
1. Scale (1-10): "How are you feeling overall right now?" — category: `general`
2. Text: "Any physical symptoms? (pain, nausea, dizziness)" — category: `symptom`
3. Scale (1-10): "How would you rate your sleep last night?" — category: `general`

**Dynamic questions (from user profile, inserted after base questions):**
- Per active health condition: Text — "How has your [condition] been lately?" — category: `condition-specific`
- Per active medication: Boolean — "Have you taken your [medication] today?" — category: `medication`

**Closing question (always last):**
4. Text (optional): "Is there anything else about your health you'd like to mention before we finish?" — category: `general`

## Validation (ValidationTools)

**Boolean:** accepts `yes/y/yeah/yep/true/1` or `no/n/nope/false/0` (case-insensitive). Normalized to `'yes'` or `'no'`.

**Scale:** integer within defined `min`-`max` range (typically 1-10). Word-form numbers ("three", "seven") are accepted via `AnswerExtractor` rule-based matching and treated as equivalent to digits — no retry is forced if rule-based extraction succeeds.

**Text:** non-empty if not optional. Output: trimmed text or `'not answered'`.

**On validation failure — intent classification:**
- `ANSWERING` → attempt LLM extraction
- `ASKING` → respond to clarification, re-ask
- `REFUSING` → skip question

## Follow-Up Architecture

Follow-up decisions are made by `FollowUpEvaluator` (an LLM-based service in `validation/FollowUpEvaluator.ts`) and are evaluated inside `AnswerInterpreter.interpret()` — **not** by hardcoded regex or score thresholds in `DecisionEngine`.

### How it works

1. After `AnswerExtractor` successfully extracts a value, `AnswerInterpreter` calls `FollowUpEvaluator.evaluate()` with the question, raw answer, extracted value, and nuance signals from `SignalDetector`.
2. `FollowUpEvaluator` makes a structured LLM call (`FollowUpEvaluationSchema`) and returns `{ question, reason }` if a follow-up is warranted, or `null` if not.
3. The result is attached to `InterpretationResult.followUp` and passed to `DecisionEngine`.
4. `DecisionEngine.handleSuccessfulExtraction()` reads `interpretation.followUp` and routes accordingly — no trigger logic needed there.

This mirrors the cognitive graph pattern: `CognitiveAnswerInterpreter.evaluateTask()` interprets the answer, `CognitiveDecisionEngine` routes based on the result.

### What the LLM evaluates

`FollowUpEvaluator` decides to follow up when:
- A scale score is notably low (≈ ≤5/10)
- Symptoms or discomfort were mentioned
- A health condition appears to be worsening or is unclear
- Medication was missed
- The answer is vague, brief, or uncertain for a question that expected detail

It does not follow up when:
- A clear high score with no concerning signals
- A confident "yes" to medication adherence
- "No symptoms" stated clearly
- The answer is already complete and detailed

### Routing

Follow-ups are inserted as `text` questions with `slot: 'general_notes'` immediately after the primary answer is recorded. Max one inserted follow-up per primary question (`currentQuestionFollowUpCount`). Multiple `general_notes` answers are **concatenated** (not overwritten) in `HealthPostCallGraph`.

`FollowUpEvaluator` is skipped for follow-up questions themselves (`id.startsWith('follow_up_')`) and when extraction failed (nothing to probe).

## Key Constants
- `MAX_RETRY_ATTEMPTS`: 2
- `MAX_FOLLOW_UP_QUESTIONS`: 2 (one inserted + wrap-up beat)
- Exit keywords: `i have to go, i need to go, stop, end, quit, skip all, i'm done, goodbye, bye`

## Known Gap — Exit Intent Detection
The current exit keyword list is narrow and misses natural completion phrases like "that covers everything", "I think we're good", "no more questions". This causes the graph to continue asking questions after the user has signalled they are done.

**Resolution:** Exit intent will be handled as an MCP tool call (`endCall`) once the telephony migration to ElevenLabs built-in Twilio integration is complete (ADR-005). The agent will invoke `endCall` when it detects conversational completion, replacing keyword matching entirely. Do not expand the keyword list — fix it properly via the MCP tool.

## State Channels
Key fields: `healthCheckQuestions`, `currentQuestionIndex`, `questionAttempts`, `healthCheckAnswers`, `rawAnswer`, `validatedAnswer`, `isValid`, `pendingClarification`, `isHealthCheckComplete`

## Durable Execution
- Checkpointer: `ShallowRedisSaver`
- Thread ID: `health_check:{userId}:{conversationId}`
- Interrupts at `wait_for_answer`, resumes via `Command({ resume: userAnswer })`

## Current Status
Fully implemented. Question set is fixed + dynamic from profile.

## Related Docs
- [Health Check PRD](../health.md) — full product requirements
- [Health Post-Call](./post-call.md)
- [SupervisorGraph](../../ai-orchestration/supervisor.md) — durable execution management
