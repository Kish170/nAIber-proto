# Health Persona Redesign — Implementation Audit

**Status:** Pre-Phase 1 scoping for Agent A.
**Companion to:** `docs/research/health-redesign.md`, `docs/prds/personas/health.md`.

This doc maps the new LLM-orchestrated conversation flow (DAG provided 2026-04-26) onto the current health persona implementation under `apps/llm-server/src/personas/health/`. Three columns: what exists, what changes, what's added.

---

## 1. Current Implementation Snapshot

### Graph topology (`HealthCheckGraph.ts`)

```
orchestrator (load questions from DB)
   ↓
ask_question (LLM, system prompt via QuestionContextBuilder)
   ↓
wait_for_answer (interrupt for human turn)
   ↓
interpret_answer (IntentClassifier → AnswerExtractor → FollowUpEvaluator)
   ↓
evaluate_and_decide (DecisionEngine)
   ↓
   ├─ wrap_up    → "anything else?" beat
   ├─ followup   → inject question at currentIndex
   ├─ retry      → re-ask with clarification flag
   ├─ confirm    → propose value, await confirmation
   ├─ skip       → record not-answered, advance
   └─ next       → record answer, advance
   ↓
finalize (LLM-generated goodbye) → END
```

### Key files

- `HealthCheckGraph.ts` — LangGraph state machine; Redis checkpointer.
- `HealthCheckState.ts` — Annotation.Root state shape.
- `HealthCheckHandler.ts` — Builds question array per user from DB at orchestration time.
- `AnswerInterpreter.ts` — Wraps `IntentClassifier` + `AnswerExtractor` + `FollowUpEvaluator`.
- `validation/IntentClassifier.ts` — Two-tier intent classification (rules → LLM).
- `validation/AnswerExtractor.ts` — Slot extraction (rules + LLM-structured).
- `validation/SignalDetector.ts` — NLP signals (uncertain, partial, correction, sentiment, engagement). **`offTopic` is hardcoded false.**
- `validation/FollowUpEvaluator.ts` — LLM probe-decision (max 20 words, max 2 per question).
- `DecisionEngine.ts` — Action router.
- `QuestionContextBuilder.ts` — Per-turn system prompt assembly.
- `post-call/HealthPostCallGraph.ts` — `parse_answers → normalize_silver → persist_structured → update_baseline → END`.
- `apps/server/src/prompts/HealthPrompt.ts` — Health system prompt.

### Question sourcing (today)

Questions are **fixed at orchestration time**. `HealthCheckHandler.initializeHealthCheck()` builds a list of:

- 4 base questions: overall wellbeing (1–10), physical symptoms (text), sleep (1–10), closing notes (text).
- 1 text question per active condition (`HealthRepository.findHealthConditionsByElderlyProfileId`).
- 1 boolean/text question per active medication (filtered by med-frequency vs. call-frequency match).

There is **no growth mechanism** — the list is locked once orchestrator finishes. Follow-ups inject into the array at `currentQuestionIndex`, but they're tightly scoped to the current question.

### Tangent / off-topic handling (today)

**Effectively absent.**

- `SignalDetector.offTopic` is set to `false` everywhere; no detector is wired up.
- `HealthPrompt.ts` instructs the LLM to "gently redirect" off-topic, but the graph never branches on it.
- If the elder goes off-topic, the answer gets extracted (or fails extraction → retry) against the current question. Off-topic content is silently lost.

### State tracked across turns

- `messages[]`, `healthCheckQuestions[]`, `currentQuestionIndex`, `healthCheckAnswers[]`
- `rawAnswer`, `lastInterpretation`, `currentDecision`
- `questionAttempts`, `currentQuestionFollowUpCount`, `pendingClarification`, `clarificationContext`
- `previousCallContext` (last visit + rolling baseline)

### Post-call extraction

Linear pipeline. `HealthCheckAnswer[]` → `WellbeingData` + `MedicationLogEntry[]` + `ConditionLogEntry[]` → DB. No tangent / topic-add records.

### System prompt posture

Calm/neutral/professional. **Predefined questions only — no invention.** No diagnostic or emotional-support language. Off-topic gets a gentle redirect (instruction only, no enforcement). Follow-ups are neutral note-taking, never interpretation.

---

## 2. New Conversation Flow (Target)

Captured from the DAG diagram supplied 2026-04-26:

```
START
  ↓
"How are you doing?"
  ├─ well → warm acknowledgment → "ready for health check-in?"
  └─ poorly → "what's wrong?"
        ├─ health-unrelated → entice + redirect to next general call
        └─ health-related → record question, add to dynamic list
  ↓ (both branches converge)
"Ready to begin health check-in?"
  ├─ no  → "why?" → record reason → end call
  └─ yes → enter orchestrator loop
              ↓
       ┌──────── LLM picks next question from dynamic list
       │           ↓
       │      Ask question
       │           ↓
       │   ┌── Confusion → clarify (sub-questions, medallion handles)
       │   │       └─ only mark PRIMARY question complete
       │   ├── Refusal   → record + advance
       │   └── Answer
       │           ↓
       │      Sub-question loop (unconstrained — LLM decides depth)
       │           ↓
       │      "Move to next question?" / user signals done
       │           ↓
       │   User talks about a different topic
       │           ├─ health-related?
       │           │     ├─ already in list → use that question
       │           │     └─ new           → create question + add to list
       │           └─ non-health → redirect back to check-in
       └──── loop until list exhausted or user wraps
              ↓
            finalize
```

### What stays the same per the requirements

- Medallion extraction architecture (sub-question reuse).
- RAG integration.

### Clinical instruments — resolved 2026-04-26

PHQ-2 and GDS-15 stay deferred per `docs/research/depression-assessment-deferred.md`. IADL stays caregiver-reported at onboarding (`IadlAssessment` model); not asked in-call. The redesigned health call therefore covers only: conditions, medications, wellbeing, sleep, symptoms, and dynamic topics surfaced by the elder. The "All clinical instruments stay the same" line in the requirements is superseded.

---

## 3. What Exists / What Changes / What's Added

### What stays (re-used as-is)

| Component | Why kept |
|---|---|
| `HealthRepository` query for conditions + medications | Solid source for initial question list |
| `HealthCheckAnswer` record shape + slot mapping | Already powers post-call persistence |
| Post-call pipeline (`parse → normalize → persist → update_baseline`) | Linear, tested, no flow-level changes needed |
| `IntentClassifier` (rules → LLM tier) | Two-tier design fits the new flow |
| `AnswerExtractor` slot-extraction | Reusable for both primary questions and tangent-derived questions |
| `SignalDetector` (uncertain, partial, correction, sentiment, engagement) | Useful inside the new orchestrator for confidence/sub-question decisions |
| `FollowUpEvaluator` core logic | Repurposed as the "should I dig deeper?" sub-question gate |
| Redis checkpointer + state-graph durability | No reason to rewrite |
| `previousCallContext` loader | Still needed for rundown + dynamic question priming |

### What changes (existing code rewritten)

| Component | Change |
|---|---|
| `HealthCheckGraph.ts` | Replace rigid `ask → interpret → decide → next-index` loop with **two new phases**: (a) `opening` subgraph (greeting + ready-check); (b) LLM-orchestrated `conversation` loop with no fixed index. Entry point becomes `opening`. |
| `HealthCheckState.ts` | Replace `currentQuestionIndex` semantics with a **dynamic question store**: `pendingQuestions[]`, `inProgressQuestion`, `completedQuestions[]`, `tangentQueue[]`. Add `openingSentiment` (well/poorly), `openingConcern` (recorded health-related concern from "what's wrong?"). |
| `HealthCheckHandler.ts` | `initializeHealthCheck()` no longer locks the list. Same DB-driven seed (conditions + meds) becomes the **starting set**, marked as such. List is mutable thereafter. |
| `DecisionEngine.ts` | Becomes much smaller. Most action routing migrates into the LLM orchestrator's tool calls (or structured output). DecisionEngine retains: refusal handling, low-confidence confirm, retry on extraction failure. |
| `QuestionContextBuilder.ts` | System prompt segments expand: opening-flow instructions, tangent-detection instructions, "stay on topic until user signals done" guidance, dynamic-list awareness. |
| `apps/server/src/prompts/HealthPrompt.ts` | Update posture: still neutral, but now LLM-orchestrated. Instructions for opening branch, tangent redirect-vs-record, sub-question depth, dynamic question creation. The "predefined questions only — no invention" line gets carved back: **invention allowed for health-relevant tangents, with explicit add-to-list semantics.** |
| `FollowUpEvaluator.ts` | Repurposed from "inject one extra question" to "should I ask another sub-question on this topic?" — output becomes a continue/advance signal rather than a question payload. |
| `SignalDetector.ts` | `offTopic` actually populated — heuristic comparing answer entities/topics against `inProgressQuestion.category`. |

### What's added (new code / new behaviour)

| New piece | Purpose |
|---|---|
| **Opening subgraph** (new node group) | `greeting → wellbeing_branch → (well_path | poorly_path) → ready_check`. Drives the "how are you doing?" → well/poorly → ready-or-end flow. |
| **`OpeningClassifier`** (new validator, sibling of IntentClassifier) | Classifies the wellbeing reply as well / poorly / ambiguous. Tier 1 rules (sentiment lexicon + keywords), Tier 2 LLM fallback. |
| **`HealthRelevanceClassifier`** (new) | Decides whether a user-introduced topic is health-related. Used in two places: (1) opening "what's wrong?" branch routing; (2) mid-call tangent handling. Rules-then-LLM. |
| **`TangentRouter`** (new) | Given a detected tangent: (a) is it health-related? (b) does an existing pendingQuestion already cover it? (c) create-new-or-merge decision. Outputs an action (`redirect`, `note_for_general`, `merge_into_pending`, `create_new_pending`). |
| **`DynamicQuestionStore`** (new state helper) | API: `enqueue(question)`, `markInProgress(id)`, `markComplete(id)`, `dropOrMerge(question)`, `next()`. Replaces the old index-based access. |
| **`SubQuestionTracker`** (new state helper) | Counts and reasons about sub-questions for the current `inProgressQuestion`. **No relational persistence** — sub-questions live only in the message medallion. The tracker is purely for orchestrator hints (depth, repetition, exit signals). |
| **`OpeningRecord` model** (potential new persisted row, or reuse `HealthCheckAnswer` with a `kind` discriminator) | Stores the elder's "I'm not doing well because…" concern surfaced in the opening branch, even if the call ends without entering the formal check-in. **Decision needed:** new table vs. discriminator. |
| **Tangent log** | Record of detected tangents with disposition (`redirect`, `noted_for_general`, `merged`, `created`). Useful for caregiver review and for surfacing to the general persona's next call. **Decision needed:** ephemeral (state only) vs. persisted. |
| **End-call-without-checkin path** | `ready_check = no` → record reason → finalize without invoking the conversation loop. New finalize variant. |
| **Tangent → general persona handoff** | When `TangentRouter` returns `note_for_general`, persist a row the general persona's next call can read on prep. **Decision needed:** schema for this — likely lives next to the existing memory store. |

---

## 4. Resolved Decisions (2026-04-26)

| # | Decision | Resolution |
|---|---|---|
| 1 | Clinical instruments | PHQ-2 / GDS-15 stay deferred. IADL stays caregiver-reported at onboarding. Health call asks only conditions, meds, wellbeing, sleep, symptoms, and dynamic topics. |
| 2 | Opening-flow persistence | New `HealthCallOpening` model. Fields: callId, sentiment (WELL/POORLY/AMBIGUOUS), statedConcern (text, nullable), disposition (PROCEEDED/ENDED_NOT_READY/REDIRECTED_GENERAL), endReason (text, nullable). One row per call. |
| 3 | Tangent log persistence | State-only. No persisted tangent records. Disposition decisions act in-the-moment (redirect / merge into pending / create new pending). |
| 4 | General-persona handoff | **Deferred to v1.next.** v1 redirects health-unrelated tangents in-call ("sounds like something for our regular catch-up") with no persisted handoff. Real cross-persona seed waits for memory medallion maturity. |
| 5 | Sub-question medallion contract | The orchestrator marks **conversation-window start/end** boundaries around each primary question. Everything inside the window — primary Q, sub-questions, clarifications, follow-ups, corrections — is handed to the medallion bronze→silver→gold pipeline as a unit. Slot extraction migrates from per-turn (`AnswerExtractor` on every answer) to **post-call window-level extraction**. The `HealthCheckAnswer` row is the final synthesis from gold. |
| 6 | Dynamic question creation guardrails | **Curated topic taxonomy + LLM phrasing.** Taxonomy: `SYMPTOM`, `MEDICATION_SIDE_EFFECT`, `SLEEP`, `PAIN`, `MOOD`, `MOBILITY`, `APPETITE`, `COGNITION_SELF_REPORT`, `OTHER_HEALTH`. LLM picks a taxonomy slot, generates phrasing within posture constraints. Anything outside taxonomy buckets into `OTHER_HEALTH` and gets noted but not interrogated. |
| 7 | End-on-not-ready behaviour | One `HealthCallOpening` row written with `disposition = ENDED_NOT_READY` and `endReason`. No `HealthCheckAnswer` rows, no baseline updates. Caregiver dashboard surfaces the reason for review. Repeat-decline pattern detection deferred to v1.next. |

## 5. Schema Implications

Phase 0 schema closeout needs to reopen for two additions:

### `HealthCallOpening` model (new)

```prisma
model HealthCallOpening {
  id              String                       @id @default(cuid())
  callId          String                       @unique
  call            Call                         @relation(fields: [callId], references: [id])
  sentiment       HealthCallOpeningSentiment
  statedConcern   String?
  disposition     HealthCallOpeningDisposition
  endReason       String?
  createdAt       DateTime                     @default(now())

  @@index([callId])
}

enum HealthCallOpeningSentiment {
  WELL
  POORLY
  AMBIGUOUS
}

enum HealthCallOpeningDisposition {
  PROCEEDED
  ENDED_NOT_READY
  REDIRECTED_GENERAL
}
```

### `HealthQuestionTopic` enum (new)

```prisma
enum HealthQuestionTopic {
  SYMPTOM
  MEDICATION_SIDE_EFFECT
  SLEEP
  PAIN
  MOOD
  MOBILITY
  APPETITE
  COGNITION_SELF_REPORT
  OTHER_HEALTH
  // existing categories like CONDITION_STATUS, MEDICATION_ADHERENCE, WELLBEING stay too
}
```

The taxonomy bound here is what the LLM picks from when inventing a new question mid-call. It supplements (does not replace) existing question categories.

### What does NOT get a new table

- Tangent log (resolution #3 — state-only).
- General-persona handoff (resolution #4 — deferred).

### `HealthCheckAnswer` shape

Stays for now. If window-level extraction is post-call only, the per-turn fields (`attemptCount`, `extractionMethod`, `confidence`) become less load-bearing. **Recommendation:** keep them for v1 (backward-compat with the post-call pipeline) and revisit once window-level extraction is stable.

## 6. Architectural Shift — Per-Turn vs. Window-Level Extraction

Today: every user turn runs through `AnswerExtractor` (rules + LLM-structured) to populate slot values. The orchestrator decides next action based on extraction success.

After redesign: the orchestrator's per-turn job is **classification only** (intent, signals, on-topic-or-tangent, ready-to-advance). Slot values are not extracted during the call. At advance-time the orchestrator emits a `WindowEnd` marker. Post-call medallion processes the bronze transcript window → silver normalized → gold structured slot. The gold slot lands on the `HealthCheckAnswer` row.

Consequences:

- `AnswerExtractor` doesn't disappear, but moves out of the live graph and into the post-call pipeline.
- `IntentClassifier` + `SignalDetector` stay in-graph — they drive orchestration without committing to a slot value.
- Confidence semantics change — confidence is now a window-level property (medallion-derived), not a per-turn property.
- `FollowUpEvaluator` becomes a "should I dig deeper on this topic?" gate, not a "should I append this exact phrasing?" gate.

This is the biggest architectural change in the redesign. Agent A's brief must call it out explicitly.

---

## 5. Suggested Refinements to Agent A's Prompt

The original Agent A prompt assumes the rigid-flow redesign is mechanical. After this audit, Agent A should be told:

- This is a **graph-shape change**, not just a state-shape change. Entry point moves; new opening subgraph; orchestrator becomes LLM-driven not index-driven.
- Reuse the validators and signal detection — don't rewrite.
- Keep post-call pipeline untouched.
- The 7 open decisions above must be raised via `AskUserQuestion` before implementation if not pre-answered in the brief.
- DAG diagram (the one supplied 2026-04-26) goes into the brief verbatim.

---

## Future Enhancements

### TangentRouter → MCP tool migration

**Current (v1):** `TangentRouter` uses an in-graph LLM structured call. The LLM receives the full `pendingQuestions[]` list and the user's tangent text, then decides `redirect | merge_into_pending | create_new_pending`. This keeps the decision logic within the LangGraph turn — no extra cross-service plumbing.

**Target (v1.next):** Migrate to an MCP tool `check_and_add_health_question(proposed, existingQuestions[])` on the MCP server, matching the pattern used by the general persona's `retrieveMemories` RAG tool. The MCP tool:
1. Receives the proposed question text + the current pending list.
2. LLM decides merge/create/redirect with full semantic context.
3. If creating: writes the new `DynamicQuestion` to a Redis key scoped to `health_tangent:{conversationId}`.
4. Graph reads the key on resume and enqueues into `pendingQuestions[]`.

**Why defer:** Requires Redis-bridged state handoff between MCP server and LangGraph graph resume — non-trivial plumbing. The in-graph call produces identical behaviour for v1. Migrate once the general persona's MCP infrastructure is stable.

---

## References

- `docs/research/health-redesign.md` — original redesign rationale
- `docs/prds/personas/health.md` — PRD (predates this audit)
- `docs/research/depression-assessment-deferred.md` — PHQ-2 / GDS-15 deferral
- `docs/decisions/adr-005-signal-independence.md` — signal architecture (relevant for tangent → indirect-signal handling)
- DAG diagram — captured in the conversation 2026-04-26
