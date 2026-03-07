# personas/health/

Structured health check-in persona — collects health data through a question-answer flow with validation.

## Communication

- **Invoked by:** SupervisorGraph when `callType` is `'health_check'`.
- **During call:** HealthCheckGraph runs a durable question loop — asks question, waits for answer (interrupt), validates, retries or moves on. State persisted to Redis via `ShallowRedisSaver` checkpointer.
- **Call end trigger:** When all questions answered or user exits, LLMRoute calls `scheduleCallEnd()` which tells Twilio to hang up after 5s.
- **Post-call:** PostCallWorker reads `healthCheckAnswers` from checkpoint state (`health_check:{userId}:{conversationId}`), invokes `HealthPostCallGraph` to persist to DB, then deletes the thread.

## What It Owns

- `HealthCheckGraph.ts` — Durable execution graph with interrupt/resume. Nodes: orchestrator → ask_question → wait_for_answer → validate_answer → check_follow_up/finalize → END. Uses `ShallowRedisSaver` checkpointer. MAX_RETRY_ATTEMPTS=2, MAX_FOLLOW_UP_QUESTIONS=2. Handles exit keywords ("stop", "bye", "skip all", etc.).
- `HealthCheckState.ts` — LangGraph `Annotation.Root` with `HealthCheckAnswer` interface (questionIndex, rawAnswer, validatedAnswer, isValid, attemptCount).
- `HealthCheckHandler.ts` — Initializes questions for a user by querying their active health conditions and medications from the database. Produces `QuestionData[]`.
- `questions/` — Question type hierarchy:
  - `Question.ts` — Base `QuestionData` type, `ValidatedAnswer`, `QuestionCategory` types.
  - `ScaleQuestion.ts` — 1-10 ratings (e.g., wellbeing, sleep quality).
  - `BooleanQuestion.ts` — Yes/no (e.g., medication adherence).
  - `TextQuestion.ts` — Free text (e.g., physical symptoms, notes).
- `tools/ValidationTools.ts` — Answer validation functions per question type.
- `post-call/HealthPostCallGraph.ts` — Persists validated health answers to database.
- `post-call/HealthPostCallState.ts` — State for health post-call processing.

## What It Does NOT Own

- System prompts (those are in `server/src/prompts/HealthPrompt.ts`).
- Thread/checkpoint management — that's handled by the checkpointer injected from `llm-server/index.ts`.

## Dependencies

- `@naiber/shared-clients` (OpenAIClient)
- `@naiber/shared-data` (HealthRepository)

## Gotchas

- `QuestionData` is plain JSON (serializable for Redis persistence), not class instances. Use `validateQuestionData()` for validation.
- Questions are dynamically generated based on user's active health conditions and medications — not a static list.
- Thread ID format: `health_check:{userId}:{conversationId}`.
