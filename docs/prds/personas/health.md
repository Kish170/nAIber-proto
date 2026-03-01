# Health Check Persona — Product Requirements

## Purpose

The health check call is a structured data collection session. Its purpose is to gather a consistent set of health-related answers from the user across calls, and make that data available to caregivers and the user themselves via a dashboard. It is the most technically complex persona due to the interrupt/resume Q&A pattern.

This persona is explicitly **not** a diagnostic or advisory tool. It asks, records, and acknowledges. It does not interpret results, offer clinical guidance, or react to answers beyond asking follow-up questions or flagging data post-call.

---

## What a Successful Health Check Looks Like

A health check call is considered successful when:

- The graph reaches the `finalize` node — the assessment is structurally complete.
- All questions were either answered (validly) or explicitly skipped after exhausting retries.
- Answers are persisted to the database via `HealthPostCallGraph`.

An incomplete assessment (call drops mid-question, user hangs up before `finalize`) is data loss. Some partial data may still be recoverable from the checkpoint state, but the call itself is not a success.

---

## User Experience Model

### Functional requirements

- The call opens with a brief, warm introduction explaining that a health check-in is starting.
- Questions are asked one at a time, in natural conversational language — not clinical form-style.
- After each answer, the AI acknowledges warmly before moving to the next question.
- If an answer is unclear, the AI rephrases the question — it does not repeat it verbatim.
- If the user refuses a question or asks to stop, the AI respects it and moves on or ends the assessment gracefully.
- At the end, the AI closes the assessment with a warm summary acknowledgement before hanging up.

### Non-functional requirements

- **Consistency:** The same question set must be asked on every call (current version). Assessment value depends on longitudinal consistency for trend analysis.
- **Pacing:** Slightly slower and more deliberate than general calls — the user is providing specific information and should not feel rushed.
- **Latency:** Each question-answer cycle must feel natural. Validation and LLM calls within the graph must not introduce noticeable pauses between the user's answer and the AI's next response.

---

## Question Set

**Current version:** Fixed set, fixed order. The same questions are asked on every health check call, regardless of user profile or previous answers.

**Planned future version:** Adaptive question set — a core set of general health questions supplemented by condition- and medication-specific questions drawn from the user's health profile. Order and content would vary based on known conditions and medications.

The question bank is defined in `HealthCheckHandler.initializeHealthCheck()` in `llm-server`. Three question types exist:

| Type | Validation | Example |
|---|---|---|
| `ScaleQuestion` | Integer in range 1–10 | "On a scale of 1 to 10, how would you rate your energy today?" |
| `BooleanQuestion` | Yes / No | "Did you take your medications this morning?" |
| `TextQuestion` | Non-empty string | "Is there anything else about how you're feeling you'd like to mention?" |

---

## Interrupt / Resume Pattern

The health check uses LangGraph's interrupt/resume mechanism with a Redis checkpointer (`ShallowRedisSaver`) for durable execution. Each conversation turn is a separate HTTP request from ElevenLabs — the graph state must survive across requests.

### Thread lifecycle

```
Turn 1 (new thread):
  orchestrator → loads question set → ask_question → wait_for_answer
  [graph interrupts, returns question text to ElevenLabs]

Turn 2 (resume with user's answer):
  Command({ resume: userAnswer }) → validate_answer → [valid] advance
  → ask_question → wait_for_answer
  [graph interrupts again, returns next question]

... repeats until all questions answered or skipped ...

Final turn:
  validate_answer → advance → finalize
  [isHealthCheckComplete = true]
  [LLMRoute schedules Twilio call end, 5s delay]
```

**Thread ID:** `health_check:{userId}:{conversationId}`

**State stored in checkpoint:** Current question index, all answers collected so far (`HealthCheckAnswer[]`), retry count for the current question, pending clarification state.

---

## Validation Rules

Each question type defines what constitutes a valid answer. The `validate_answer` node runs after every user response.

### ScaleQuestion
- Valid: an integer the user states in the range 1–10
- Invalid: a non-numeric response, a number outside 1–10, or an ambiguous answer ("somewhere in the middle")
- On ambiguity: attempt LLM extraction via `ValidationTools` — infer the most likely integer from natural language ("about a six" → 6)

### BooleanQuestion
- Valid: any clear yes or no statement
- Invalid: ambiguous ("I think so", "sort of", "it depends")
- On ambiguity: attempt LLM extraction — infer the most likely boolean. If extraction fails, count as invalid.

### TextQuestion
- Valid: any non-empty substantive response
- Invalid: single-word non-committal responses if the question expected elaboration (e.g. "fine" as a complete answer to an open health question may trigger a gentle follow-up)

---

## Retry Behaviour

If validation fails, the graph rephrases and re-asks the question. Retry count is tracked per question in the graph state.

| Condition | Behaviour |
|---|---|
| Answer invalid, retries remaining | Rephrase and re-ask |
| Answer invalid, retries exhausted (`MAX_RETRY`) | Skip question, record as unanswered, advance |
| Exit intent detected ("stop", "I don't want to do this", "bye") | Skip remaining questions, go directly to `finalize` |
| User confused or answer nonsensical | Attempt LLM extraction first. If extraction fails, treat as invalid. |

The AI does not reveal that an answer "failed validation" — it simply rephrases naturally ("Let me ask that a slightly different way…").

**Follow-up questions:** For relevant answers, the AI may ask at most 2 follow-up questions before advancing to the next primary question.

---

## Health Data Schema

Answers are persisted to Postgres via `HealthRepository` during `HealthPostCallGraph`. The checkpoint state holds `HealthCheckAnswer[]` — each entry contains:

- `questionId` — identifier of the question asked
- `questionType` — `'scale'` | `'boolean'` | `'text'`
- `rawAnswer` — the user's original response string
- `validatedAnswer` — the parsed, validated value (integer, boolean, or string)
- `wasSkipped` — `true` if the question was skipped after retry exhaustion
- `followUpAnswers` — array of follow-up answer strings, if any

**What counts as a complete assessment:** Currently v1 — the graph reached `finalize`. Skipped questions are recorded as `wasSkipped: true`. A future version may define a minimum answered-question threshold below which the assessment is flagged as low-confidence.

---

## Post-Call Flow

```
Call ends (isHealthCheckComplete = true, or call drops)
  → server dispatches BullMQ post-call-processing job (3s delay)
  → PostCallWorker picks up job (callType = 'health_check')
  → Read checkpoint state: checkpointer.getTuple(thread_id)
  → Extract state.values.healthCheckAnswers[]
  → HealthPostCallGraph:
      1. Persist answers to Postgres via HealthRepository
      2. Create health check log entry
  → Delete checkpoint thread from Redis
  → Redis cleanup: delete rag:topic:{conversationId}
  → SessionManager.deleteSession()
```

**No RAG processing** — health check calls do not generate conversation embeddings. The structured answer data goes to Postgres only.

---

## Data Consumers

| Consumer | Access | Timeframe |
|---|---|---|
| Caregivers | Dashboard UI — view assessment results per call | Current / near-term |
| Users themselves | Dashboard UI — view own health history | Current / near-term |
| Automated trend analysis | Flag anomalies, declining scores, missed medication patterns | Future |

---

## Edge Cases

| Scenario | Expected behaviour |
|---|---|
| User reports a concerning symptom mid-assessment (e.g. chest pain, can't get out of bed) | Record the answer as data. Respond with empathy. Surface emergency contact info if physical safety is at risk. Continue the assessment unless the user wants to stop. *Note: an emergency detection tool is under consideration for future iterations.* |
| User refuses to answer a question | Accept the refusal gracefully. Skip the question (record as skipped). Move to the next. |
| User wants to stop entirely | Detect exit intent, go directly to `finalize`. Do not force continuation. |
| Call drops mid-assessment | Checkpoint state is preserved in Redis. If the call reconnects as a new session with the same user, the graph detects an interrupted thread and resumes. If not reconnected, partial answers remain in the checkpoint until the post-call worker runs and recovers what exists. |
| User gives valid-sounding answer for wrong question type | Attempt LLM extraction. If extraction yields a plausible value for the expected type, accept it. Otherwise, rephrase. |
| Health check completes but post-call worker fails | BullMQ retries up to 3 times with exponential backoff. If all retries fail, the checkpoint thread is not deleted and the job appears in the failed queue (visible at `/admin/queues`). |

---

## ElevenLabs Voice Expectations

- **Tone:** Warm and reassuring — not clinical, not brisk.
- **Pacing:** More deliberate than the general persona. The user is being asked to recall and report specific information.
- **Question framing:** Questions are rephrased into natural conversational language before being spoken — not read out as form fields.
- **Acknowledgements:** Brief affirmations after each answer ("Got it, thank you") keep the flow human without adding noise.
- **First message:** Fixed — introduces the health check-in warmly and sets expectations. Defined in `HealthPrompt.generateFirstMessage()` in `server/src/prompts/`.

---

## Known Gaps

- **Exact question set** is not documented here — it lives in `HealthCheckHandler.initializeHealthCheck()`. It should be extracted and listed explicitly once finalised.
- **Adaptive question set** (condition/medication-driven ordering) is planned but not yet designed. A future PRD iteration should define the selection criteria.
- **Completeness threshold** is not yet defined. Currently any assessment that reaches `finalize` is treated as complete regardless of how many questions were skipped.
- **Emergency handling** is minimal (surface contact info, record answer). A dedicated in-call emergency detection tool is under consideration.
- **`MAX_RETRY` value** is a code constant in `HealthCheckGraph` — it is not currently a configurable parameter.
