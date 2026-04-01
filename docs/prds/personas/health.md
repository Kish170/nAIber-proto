# Health Check Persona — Product Requirements

## Implementation Status

| Phase | Description | Status |
|---|---|---|
| A | Agent loop refactor — `HealthCheckState` + `HealthCheckGraph` durable execution | ✅ Complete |
| B | Slot-based data model — structured answer extraction per question type | ✅ Complete |
| C | Medication date + frequency — schedule-aware question generation | ✅ Complete |
| D | Previous call context injection — `previousCallContext` seeded from last health check | ✅ Complete |
| E | Dashboard + session detail — health data visible in caregiver UI | ✅ Complete |

### Current State (as of March 2026)

End-to-end flow is working. A health check call:
1. Initialises with adaptive questions (wellbeing, sleep, condition-specific, medication-specific)
2. Injects `previousCallContext` from the last completed health check
3. Runs the interrupt/resume Q&A loop with per-type validation and follow-up logic
4. Generates a contextual LLM goodbye that acknowledges the last discussed topic
5. Post-call: creates both a `HealthCheckLog` (with `callLogId` linked) and a `CallLog` (`callType: HEALTH_CHECK`)
6. Dashboard shows baseline averages, last check snapshot, and wellbeing trend chart
7. Session detail page shows wellbeing, medications, and conditions for any health call

### Known Issues

| Issue | Severity | Notes |
|---|---|---|
| Symptom extraction on open-ended final question | Medium | Free-text answers like "knee pain" are stored in `generalNotes` but `hasSymptoms` may remain false. Would need a NER pass on `generalNotes` to populate `physicalSymptoms` correctly. |
| Duplicate question at high request frequency | Low | Two ElevenLabs requests arriving ~1.5s apart can both hit `evaluate_and_decide` before the checkpoint updates, producing a duplicate question. An idempotency guard in `PostCallWorker` or a debounce in `LLMRoute` would fix this. |
| Follow-up answers overwriting parent slot | Fixed | `buildFollowUpQuestion` was using `slot: parent.slot`, causing follow-up text answers to overwrite numeric scores. Fixed — follow-ups now use `slot: 'general_notes'`. |

---

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

**Current version:** Adaptive set generated at call initialisation time from the user's health profile. A fixed core (wellbeing, sleep quality, physical symptoms, general notes) is supplemented by condition-specific and medication-specific questions drawn from `ElderlyProfile.healthConditions` and `ElderlyProfile.medications`. The question set is regenerated fresh each call.

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
  [finalize generates a contextual LLM goodbye referencing the last 3 answers]
  [isHealthCheckComplete = true]
  [LLMRoute schedules Twilio call end, 10s delay]
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
      1. Create CallLog (callType: HEALTH_CHECK, status: COMPLETED)
      2. Create HealthCheckLog linked via callLogId
      3. Create WellbeingLog, MedicationLog[], ConditionLog[] as children
      4. Upsert HealthBaseline (recomputed across last N calls)
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

## Medication Tracking

### Schedule model

Medication frequency is stored as a structured `MedicationSchedule` JSON object on `UserMedication.frequency` (Prisma `Json` field). This replaces the previous free-text string and allows programmatic reasoning about call relevance.

```typescript
interface MedicationSchedule {
    timesPerDay?: number;    // 1, 2, 3 — covers once/twice/three times daily
    perWeek?: number;        // 1–7 — covers "three times a week", "weekly"
    intervalDays?: number;   // every N days — covers bi-weekly (14), monthly (30)
    prn?: boolean;           // as-needed / PRN
}
```

### Frequency classification

At question-generation time, each medication's schedule is classified into one of four classes:

| Class | Condition | Behaviour |
|---|---|---|
| `daily` | `timesPerDay` set, or fallback | Ask on DAILY calls; on WEEKLY calls ask general adherence ("have you been taking it regularly this week?") |
| `weekly` | `perWeek` set (no `timesPerDay`) | Ask on WEEKLY calls; skip on DAILY calls (not relevant today) |
| `infrequent` | `intervalDays >= 14` | Skip on all calls — we cannot determine the correct window without tracking last dose date |
| `prn` | `prn: true` | Skip on all calls |

### Call cadence × question type matrix

| Call frequency | Med class | Question type | Example |
|---|---|---|---|
| DAILY | daily | `BooleanQuestion` | "Have you taken your Metformin today?" |
| DAILY | weekly | skip | — |
| DAILY | infrequent | skip | — |
| WEEKLY | daily | `TextQuestion` | "Have you been taking your Metformin regularly this week?" |
| WEEKLY | weekly | `BooleanQuestion` | "Did you take your Vitamin D this week?" |
| WEEKLY | infrequent | skip | — |
| Any | prn | skip | — |

### Adherence model

Post-call, adherence is stored differently depending on the question type used:

- **`BooleanQuestion`** (`adherenceContext: 'specific_date'`): `medicationTaken: boolean`, `takenAt: date of call`
- **`TextQuestion`** (`adherenceContext: 'general_period'`): `adherenceRating: string`, `periodStart / periodEnd: last 7 days`

### Known limitations

- **Infrequent medications** (`intervalDays >= 14`) are currently skipped entirely. To ask about these correctly, the system would need to track the last confirmed dose date and compute the next expected window. This is a planned future enhancement.
- **Sub-daily scheduling** (e.g. "take with breakfast, lunch, and dinner") is not modelled beyond `timesPerDay`. Meal-linked timing is captured in the medication `notes` field only.
- **Call cadence changes**: If a user switches from DAILY to WEEKLY calls, their medication question history will mix `specific_date` and `general_period` entries — trend queries should group by `adherenceContext`.

---

## Previous Call Context (Phase D) ✅

During each call, the agent is seeded with a `previousCallContext` string derived from the most recent completed health check log. This gives the LLM context to reference prior scores, surface notable changes ("last time you said 3/10"), and ask more targeted follow-up questions.

The context is formatted at call initialisation time by `HealthCheckHandler.formatPreviousCallContext()` and includes: date of last check, wellbeing/sleep scores, reported symptoms, condition change-from-baseline, and medication adherence. It is injected into the question system prompt via `QuestionContextBuilder` under `## Previous Visit Context`. The LLM is instructed to surface it when contextually relevant, not recite it in full.

### Gold Layer — Future Enhancement

The current implementation uses the **single most recent call** as context. The plan is to eventually replace this with a **gold-layer aggregated summary** computed offline across the last N calls. This summary would be:

- Computed by a small LLM or BERT model after each call (not in the call hot path)
- Stored as a pre-computed text field on the `ElderlyProfile` or a dedicated `HealthSummary` model
- Used verbatim during calls to eliminate per-call aggregation and reduce token usage
- Also used as the data source for dashboard trend queries (Phase E)

The `HealthRepository.findRecentHealthChecksWithDetails(elderlyProfileId, count)` method exists to support this future aggregation step. It is not yet called in the call path.

---

## Known Gaps

- **Exact question set** is not documented here — it lives in `HealthCheckHandler.initializeHealthCheck()`. It should be extracted and listed explicitly once finalised.
- **Adaptive question set** (condition/medication-driven ordering) is planned but not yet designed. A future PRD iteration should define the selection criteria.
- **Completeness threshold** is not yet defined. Currently any assessment that reaches `finalize` is treated as complete regardless of how many questions were skipped.
- **Emergency handling** is minimal (surface contact info, record answer). A dedicated in-call emergency detection tool is under consideration.
- **`MAX_RETRY` value** is a code constant in `HealthCheckGraph` — it is not currently a configurable parameter.
