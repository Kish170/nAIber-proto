# Pre-Deployment Functional Requirements

Last updated: 2026-03-29

---

## Overview

This document defines the minimum functional requirements for a demo-ready nAIber system — one that real elderly users can call across all three call types (general conversation, health check, cognitive assessment) and caregivers can review persisted outcomes.

**What "demo-ready" means:**
- All three personas complete calls end-to-end without errors
- Health and cognitive data is structured and persisted after calls
- Caregivers can query call results via a read-only web API
- Interaction quality is acceptable for a small real-user sample

**Personas in scope:** Health Check, Cognitive Assessment, General Conversation

**Delivery sequence:**
```
Phase 1: Baseline test run (health + cognitive text-test.ts)
Phase 2: Tier 1 fixes (security, KG validation)
Phase 3: Health persona build (Prisma models + structured post-call)
Phase 4: Cognitive persona build (demographic adjustment, confidence scoring)
Phase 5: Testing (layer 2 integration tests + RAG tracing setup)
Phase 6: ADR migrations (ADR-005 telephony + ADR-008 general persona native LLM)
Phase 7: RAG quality improvements (KG + VDB + tracing-informed tuning)
Phase 8: Web API data visibility (caregiver endpoints)
Phase 9: Demo readiness validation
```

Health and Cognitive persona work (Phases 1–5) comes before ADR migrations and general persona improvements (Phases 6–8).

---

## Demo Scope

### Health Check
- Dynamic profile-driven Q&A (conditions + medications from ElderlyProfile)
- Answer validation + retry logic + follow-up questions
- Structured persistence: HealthLog, MedicationLog[], HealthConditionLog[]
- Graceful call end

### Cognitive Assessment
- Full 12-task flow (3 wellbeing + 9 cognitive) with multi-turn task handling
- Domain scoring + baseline updates + drift detection
- Graceful deferral and distress handling

### General Conversation
- Natural conversation with RAG-backed memory recall (post ADR-008 migration)
- ElevenLabs native LLM handling conversation
- KG + VDB retrieval at acceptable quality (validated via tracing)
- Graceful call end mechanism

### Data Visibility (caregiver-facing)
- Read-only web API endpoints for health check results and cognitive test results
- No dashboard required for initial demo — queryable via API client (e.g. Postman) is sufficient

---

## Out of Scope

| Item | Reason |
|---|---|
| PHQ-2 / IADL / cognitive self-report questions | Phase 3b/3c — not core for demo |
| IADLAssessment Prisma model | No IADL questions in scope |
| Health alerts / trend analysis | Phase 3b extras |
| DemographicAdjustment.ts | Scoring enhancement — Phase 4a |
| BaselineInitializer.ts (IQCODE) | Scoring enhancement — Phase 4b |
| ConfidenceScoring.ts | Scoring enhancement — Phase 4d |
| Health-to-cognitive confounding flags | Phase 4c — depends on Redis signal sharing |
| Redis signal sharing (30-day TTL) | Phase 3d |
| Drift notifications / escalation (SMS, push) | Phase 5+ |
| Indirect speech signal extraction | Phase 4+ |
| Caregiver invitation flow | Web workstream — Phase 6+ |
| Elderly user preferences update endpoint | Web workstream |
| Full web dashboard / frontend | Separate workstream |
| Full scheduler automation (QueuePopulator/Processor) | Calls triggered manually for demo |
| Telephony infrastructure improvements | Post-batch |
| Structured logging / call tracing beyond RAG | Infrastructure phase |

**Manual scheduling is acceptable for demo** — QueuePopulator/Processor scaffold exists but full automation is not required. Calls can be triggered manually or via Twilio tooling.

---

## Functional Requirements — Health Persona

| # | Requirement |
|---|---|
| H1 | System generates a personalized question set from the user's active conditions and medications |
| H2 | Each question type (boolean, scale, text) is presented in natural language with correct framing |
| H3 | Responses are validated against expected types; invalid answers trigger a clarification request |
| H4 | Retry logic: max 2 attempts per question before skipping with a graceful acknowledgement |
| H5 | Up to 2 follow-up questions generated for ambiguous or borderline answers |
| H6 | Intent classification correctly routes: answering / asking a question back / refusing |
| H7 | Call ends gracefully after all questions are exhausted (scheduleCallEnd fires with 5s delay) |
| H8 | Checkpoint state is durable — interrupt/resume via FixedShallowRedisSaver works correctly |
| H9 | Post-call: HealthLog, MedicationLog[], and HealthConditionLog[] rows are persisted to DB |
| H10 | Prisma models exist: `HealthLog`, `MedicationLog`, `HealthConditionLog` |
| H11 | HealthPostCallGraph expanded to parse → persist nodes (analyze/alerts not required for demo) |

**Acceptable limitations:**
- No PHQ-2, IADL, or cognitive self-report questions
- No health trend analysis or alerts
- No Redis signal sharing between personas

---

## Functional Requirements — Cognitive Persona

| # | Requirement |
|---|---|
| C1 | All 12 tasks (3 wellbeing + 9 cognitive) are presented in order with correct prompts |
| C2 | Multi-turn tasks work correctly: word registration retries, digit span A/B trials, delayed recall phases (free → cued → recognition) |
| C3 | Task scoring is computed correctly per task type |
| C4 | Domain scores (6 domains) are aggregated and normalized after session |
| C5 | Stability index is computed with correct domain weights |
| C6 | Deferral is handled gracefully — isPartial / isDeferred flags set correctly, post-call handles both states |
| C7 | Distress detection flag is set when triggered; call can end early if needed |
| C8 | Post-call 4-node pipeline completes: compute_scores → persist_results → update_baseline → check_drift |
| C9 | Baseline is created on first session; updated via weighted moving average on subsequent sessions |
| C10 | Drift detection runs and logs notable/significant drift (no notification required) |
| C11 | Content rotation uses sessionIndex for word lists, digit sets, letters, abstraction pairs |
| C12 | Thread checkpoint is deleted from Redis after post-call processing completes |

**Acceptable limitations:**
- Scores not demographically adjusted (flat thresholds used)
- No IQCODE-based baseline initialization
- No confidence scoring attached to results
- No health confounding flag applied to drift scoring
- No drift notifications sent (logged only)

---

## Functional Requirements — General Persona (post-migration)

| # | Requirement |
|---|---|
| G1 | ElevenLabs native LLM handles conversation (ADR-008 migration complete) |
| G2 | RAG retrieval exposed via `retrieveMemories` MCP tool at acceptable quality |
| G3 | KG retrieval (topic traversal, related topics, persons) integrated with RAG results |
| G4 | Qdrant similarity search returns relevant highlights at a tuned threshold |
| G5 | Call ends gracefully (end-call mechanism designed and implemented post-migration) |
| G6 | Post-call: topic extraction + RAG embedding + KG population runs without errors |
| G7 | RAG tracing is in place to validate retrieval quality — prerequisite for accepting G2/G3/G4 |

**Note:** RAG tracing (G7) must be in place before G2–G4 can be accepted as demo-ready. Without it, retrieval quality is unverifiable.

---

## Functional Requirements — Data Visibility (Web API)

| # | Requirement |
|---|---|
| W1 | `GET /users/:userId/health-logs` — list of health check logs with structured data |
| W2 | `GET /users/:userId/health-logs/:logId` — single log with medication + condition detail |
| W3 | `GET /users/:userId/cognitive-results` — list of cognitive results with domain scores + stability index |
| W4 | `GET /users/:userId/cognitive-results/:resultId` — single result with full domain breakdown |
| W5 | Endpoints are authenticated — caregiver can only access linked elderly users |

---

## Identified Issues (Classified)

| Issue | Persona | Classification |
|---|---|---|
| Health structured persistence commented out in HealthCheckHandler | Health | ✅ In Scope |
| Prisma models missing: `HealthLog`, `MedicationLog`, `HealthConditionLog` | Health | ✅ In Scope |
| HealthPostCallGraph is single-node — no parse/persist expansion | Health | ✅ In Scope |
| DemographicAdjustment.ts not built | Cognitive | ❌ Out of Scope |
| BaselineInitializer.ts not built | Cognitive | ❌ Out of Scope |
| ConfidenceScoring.ts not built | Cognitive | ❌ Out of Scope |
| Health confounding flags not implemented | Cognitive | ❌ Out of Scope |
| Redis signal sharing not implemented | Cross-persona | ❌ Out of Scope |
| Drift notifications not sent (logged only) | Cognitive | ❌ Out of Scope |
| General call end-call mechanism incomplete | General | ✅ In Scope (post-migration) |
| KG pipeline end-to-end not validated | General | ✅ In Scope (post-migration) |
| RAG quality not validated — no tracing | General | ✅ In Scope — tracing is prerequisite |
| ADR-005 telephony migration not done | Telephony | ✅ In Scope (pre-demo) |
| ADR-008 general persona migration not done | General | ✅ In Scope (pre-demo) |
| Web API health/cognitive endpoints missing | Web | ✅ In Scope |
| No onboarding flow for new demo users | Web | ⚠️ Nice to Have — manual seeding acceptable for small sample |
| Caregiver invitation flow incomplete | Web | ⚠️ Nice to Have — manual linking acceptable for demo |

---

## Issue → Requirement Mapping

**Health structured persistence (saveHealthLog, saveMedicationLogs, saveHealthConditionLogs commented out)**
- Impact: No structured health data persisted after calls. HealthCheckLog row exists but per-medication and per-condition data is absent.
- Required: Add Prisma models → uncomment save methods → expand HealthPostCallGraph with parse + persist nodes.

**HealthPostCallGraph single-node**
- Impact: Even after models are added and save methods uncommented, the post-call graph does not call them — it only saves a raw log.
- Required: Add `parse_answers` node (calls `HealthCheckHandler.parseHealthCheckAnswers`) and `persist_health_data` node (saves HealthLog / MedicationLog[] / HealthConditionLog[]). Analyze and alerts nodes are not required for demo.

**General call end-call mechanism**
- Impact: General calls may not terminate naturally, leading to runaway ElevenLabs sessions and user confusion.
- Required: After ADR-008 migration, design and implement an end-call mechanism for the native LLM path (equivalent to scheduleCallEnd() in the current graph-based flow).

**RAG tracing**
- Impact: No visibility into what memories are being retrieved. Cannot verify relevance or detect retrieval failures before demo.
- Required: Trace RAG queries and results; establish a minimum recall quality threshold before accepting G2/G4 as done.

**ADR-005 + ADR-008 migrations**
- Impact: General persona runs on ConversationGraph — adds latency and maintenance burden. ElevenLabs native LLM is simpler and more reliable for demo.
- Required: Both migrations complete before demo. ADR-005 (telephony MCP) prerequisite for ADR-008.

**Web API data visibility**
- Impact: Caregivers cannot review call outcomes. The feedback loop that motivates the demo does not exist without it.
- Required: Minimum read-only health log + cognitive result endpoints, scoped to caregiver's linked users.

---

## Things to Consider That Are Not Yet in current.md

These items are not currently tracked but matter before real customers interact with the system:

1. **User profile completeness** — Health check question generation depends on `conditions` and `medications` being populated in ElderlyProfile. For demo users, these must be seeded manually before calls. Consider whether there's a lightweight admin path for this.

2. **Caregiver linking** — The caregiver invitation flow is not complete. For the demo sample, caregivers need to be manually linked to elderly users in the DB for data visibility to work.

3. **Non-diagnostic language audit** — The cognitive PRD has strict rules on language (no clinical terms, no diagnostic framing). Prompts and AI responses should be reviewed against this list before real users interact.

4. **Consent / recording notice** — Twilio and ElevenLabs may record or transcribe calls. A brief consent notice at call start is advisable before real customers are added.

5. **Content rotation seed state** — Cognitive sessionIndex drives content rotation. Confirm `CognitiveHandler.initializeCognitiveTest()` returns sessionIndex = 0 (not null) for first-session users.

6. **ElevenLabs agent configuration** — Each call type routes to a specific ElevenLabs agent. Verify agent IDs in the environment are correct and agents have the right system prompts before demo.

7. **General end-call after ADR-008** — `scheduleCallEnd()` is currently wired to the LangGraph finalize node. After migration to ElevenLabs native LLM, this mechanism has no equivalent and must be explicitly designed as part of the migration work.

---

## Pre-Deployment Readiness Criteria

### Health Check

- [ ] Profile-driven question set loads without errors for a test user with conditions + medications
- [ ] Round-trip Q&A completes (question asked → answer validated → next question)
- [ ] Invalid answer triggers clarification, not a crash
- [ ] Retry cap (2 attempts) enforced — question skipped gracefully on exhaustion
- [ ] Call ends gracefully after all questions are exhausted
- [ ] PostCallWorker persists HealthLog + MedicationLog[] + HealthConditionLog[] rows
- [ ] Thread deleted from Redis after post-call
- [ ] Health data queryable via web API (W1, W2)

### Cognitive Assessment

- [ ] All 12 tasks complete without errors on a test run
- [ ] Word registration multi-turn flow (retries) works correctly
- [ ] Digit span A/B trial logic advances correctly (length + consecutive failure tracking)
- [ ] Delayed recall progresses through free → cued → recognition phases
- [ ] Domain scores and stability index are non-null after a completed session
- [ ] Post-call 4-node pipeline completes without errors
- [ ] Baseline row created (or updated) in DB after call
- [ ] Drift check runs (even if result is "stable")
- [ ] Thread deleted from Redis after post-call
- [ ] Cognitive results queryable via web API (W3, W4)

### General Persona (post-migration)

- [ ] ADR-008 migration complete — ElevenLabs native LLM handling conversation
- [ ] RAG MCP tool returning relevant memories (validated via tracing)
- [ ] KG pipeline end-to-end validated — topics + relationships populated after a general call
- [ ] Call ends gracefully
- [ ] Post-call runs without errors (topic extraction + embedding + KG population)

### System-Wide

- [ ] `text-test.ts` baseline passes for health + cognitive (Phase 1)
- [ ] No unhandled exceptions in logs during simulated calls
- [ ] ElderlyProfile + caregiver data seeded for all demo users
- [ ] ElevenLabs agent IDs verified per call type in environment config
- [ ] Non-diagnostic language reviewed in cognitive prompts

---

## Call Observation Checklist

Use during live test calls to identify functional issues.

| Observation | What It Indicates | Possible Issue |
|---|---|---|
| Question not asked / skipped silently | Question generation failed | `initializeHealthCheck` returned empty — no conditions or medications in DB for this user |
| Same question repeated after an answer | Retry counter not incrementing | `questionAttempts` not updating in state |
| Answer accepted for the wrong type | Validation not firing | `validateAnswer` dispatcher routing error |
| Clarification loop does not terminate | Follow-up cap not enforced | `MAX_FOLLOW_UP_QUESTIONS` check missing or not reached |
| Call does not end after last question | `scheduleCallEnd` not called | `finalize` node not reached — check LangGraph edge routing |
| Call ends mid-session | Premature finalize or uncaught error | Check orchestrator routing condition |
| Cognitive task prompt repeated | `currentTaskIndex` not advancing | Route-next increment condition bug |
| Digit span does not advance in length | Success / failure tracking incorrect | `currentLength` / `consecutiveFailures` state update issue |
| Delayed recall skips cued or recognition phase | Phase transition not triggering | `delayedRecallPhase` state transition condition |
| Distress flag set unexpectedly | Wellbeing evaluation false positive | Wellbeing response evaluation logic in CognitiveGraph |
| Post-call job not triggered after call | BullMQ job not dispatched | Server's PostCallQueue dispatch failing — check callType classification |
| Baseline not created after first session | `update_baseline` node skipped | `isDeferred` or `isPartial` flag incorrectly set |
| Stability index is 0 or NaN | Empty taskResponses in post-call state | State channel not carrying task responses through checkpoint |
| General call does not end | End-call mechanism missing | Needs explicit design as part of ADR-008 migration |
| RAG retrieval returns irrelevant memories | VDB similarity issue | Threshold too low/high; embeddings stale or mismatched |

---

## Validation Tests

### Health — Scenario

1. User with 1 medication + 1 chronic condition — verify question count, correct question types, structured DB persistence
2. User with no conditions — verify graceful empty state, no crash, sensible fallback
3. User refuses a question mid-call — verify retry → skip → continue flow
4. Invalid scale answer ("yes" for a 1–10 scale) — verify LLM extraction fires, then clarification if extraction fails
5. Checkpoint interrupted mid-call, new call resumes — verify correct question index is restored

### Cognitive — Scenario

6. Full completion — all 12 tasks, non-deferred, domain scores and stability index persisted, baseline updated
7. Partial session (user defers mid-way) — isPartial flag set, post-call pipeline handles gracefully (skips scoring update)
8. Second session — baseline updates (weighted average, version increments), drift check runs with prior baseline
9. Distress detected in wellbeing response — distressDetected flag set, early-end path available
10. All digit span trials fail — longestForward = 0, longestReverse = 0, no crash

### General — Scenario (post-migration)

11. Call with prior conversation history — RAG returns relevant memories, confirmed via tracing
12. Call with no prior history — RAG returns empty gracefully, no crash, conversation still flows
13. Post-call topic extraction — topics created or updated in KG after call ends
14. Call ends naturally — end-call mechanism fires correctly

### Data Visibility

15. Health log API — call completes, GET endpoint returns structured medication + condition data (not raw answers array)
16. Cognitive result API — call completes, GET endpoint returns domain scores + stability index

### Edge Cases / Failure

17. DB unavailable during post-call — error is caught and logged, thread is still deleted from Redis
18. LLM timeout during health answer extraction — fallback behavior, call continues (answer skipped or raw answer used)
19. ElderlyProfile with no conditions or medications — health check handles empty question set gracefully, no crash

---

## Critical Files (Implementation Reference)

| File | Relevance |
|---|---|
| `apps/llm-server/src/personas/health/HealthCheckHandler.ts` | Commented-out save methods — H9, H10 |
| `apps/llm-server/src/personas/health/post-call/HealthPostCallGraph.ts` | Single-node — needs parse + persist expansion (H11) |
| `apps/llm-server/src/personas/cognitive/CognitiveGraph.ts` | Core cognitive flow — C1–C7 |
| `apps/llm-server/src/personas/cognitive/post-call/CognitivePostCallGraph.ts` | 4-node pipeline — C8–C12 |
| `apps/llm-server/src/workers/PostCallWorker.ts` | Routes health + cognitive post-call jobs |
| `docs/tracking/implementation.md` | Outstanding work reference |
| `docs/decisions/adr-005-*.md` | Telephony migration spec |
| `docs/decisions/adr-008-*.md` | General persona migration spec |
