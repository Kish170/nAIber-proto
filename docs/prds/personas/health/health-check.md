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
4. Text (optional): "Anything else about how you're feeling?" — category: `general`

**Dynamic questions (from user profile):**
- Per active health condition: Text — "How has your [condition] been lately?" — category: `condition-specific`
- Per active medication: Boolean — "Have you taken your [medication] today?" — category: `medication`

## Validation (ValidationTools)

**Boolean:** accepts `yes/y/yeah/yep/true/1` or `no/n/nope/false/0` (case-insensitive). Normalized to `'yes'` or `'no'`.

**Scale:** integer within defined `min`-`max` range (typically 1-10).

**Text:** non-empty if not optional. Output: trimmed text or `'not answered'`.

**On validation failure — intent classification:**
- `ANSWERING` → attempt LLM extraction
- `ASKING` → respond to clarification, re-ask
- `REFUSING` → skip question

## Key Constants
- `MAX_RETRY_ATTEMPTS`: 2
- `MAX_FOLLOW_UP_QUESTIONS`: 2
- Exit keywords: `i have to go, i need to go, stop, end, quit, skip all, i'm done, goodbye, bye`

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
