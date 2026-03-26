# Current Plan — Pre-Deployment

Last updated: 2026-03-25

## Phase 1: Baseline (do first, before anything changes)
- Run `scripts/text-test.ts` for health and cognitive call types
- Capture baseline behavior — note any failures before Build Now changes start

## Phase 2: Remaining Tier 1 Fixes
Quick/low-risk fixes. Security fix goes first.

| Item | File |
|---|---|
| ConversationResolver fallback removal (security) | `docs/tracking/implementation.md` — Telephony |
| General call end-call mechanism | `docs/tracking/implementation.md` — Telephony |
| KG pipeline end-to-end validation | `docs/tracking/implementation.md` — Knowledge Graph |
| Scheduler QueuePopulator + QueueProcessor scaffolds | `docs/tracking/implementation.md` — Scheduler |

## Phase 3: Build Now — Health (in dependency order)

| Step | Item |
|---|---|
| 3a | New Prisma models: `HealthLog`, `MedicationLog`, `HealthConditionLog`, `IADLAssessment` — prerequisite for all health persistence |
| 3b | Structured health post-call — uncomment `saveHealthLog()` / `saveMedicationLogs()` / `saveHealthConditionLogs()` in `HealthCheckHandler`; expand `HealthPostCallGraph` to 4-node graph (parse → persist → analyze → alerts) |
| 3c | PHQ-2 (2 scale questions, score 0–3) + IADL questions (4 boolean) + Cognitive self-report questions (3 questions) added to health check flow |
| 3d | Redis signal sharing — health post-call writes mood/sleep/IADL/medication signals with 30-day TTL |

## Phase 4: Build Now — Cognitive (in dependency order)

| Step | Item |
|---|---|
| 4a | `DemographicAdjustment.ts` — threshold adjustments using education/age from `ElderlyProfile` (standalone) |
| 4b | `BaselineInitializer.ts` — IQCODE informant data → prior expectations, blended with first test at 0.6/0.4 (standalone) |
| 4c | Health-to-cognitive confounding flags — read Redis health signals before scoring; downgrade drift category when confounders present (needs Phase 3d) |
| 4d | `ConfidenceScoring.ts` + schema additions: `confidenceScore` / `confidenceFactors` on `CognitiveTestResult` (standalone) |

## Phase 5: Layer 2 Integration Tests

| Item |
|---|
| Vitest setup — root `vitest.config.ts` + llm-server config |
| Health: `HealthCheckGraph` durable Q&A flow, new PHQ-2/IADL/self-report questions |
| Health post-call: `HealthPostCallGraph` 4-node persistence |
| Cognitive scoring: `DemographicAdjustment`, `ConfidenceScoring` unit tests |
| Cognitive post-call: scores → persist → baseline → drift |
| Signal sharing: Redis health signal read/write |

Full spec details in `docs/tracking/tests.md`.

## Phase 6: Batch 4 + 5 PRDs (can be written in parallel with coding)

| Batch | PRDs needed |
|---|---|
| Batch 4 — Web | `prds/web/back-end.md`, `prds/web/front-end.md`, `prds/web/onboarding.md` |
| Batch 5 — Scheduler + Infrastructure | `prds/scheduler/scheduling.md`, `prds/scheduler/queue-processing.md`, `prds/infrastructure/*.md` |

## Phase 7: Post-Batch Migrations (last, before deployment)
1. **Telephony** (ADR-005) — ElevenLabs built-in Twilio integration + MCP server exposing `registerSession`, `getUserProfile`, `dispatchPostCall`, `getCallType`
2. **General persona** (ADR-008) — native LLM, RAG as `retrieveMemories` MCP tool, remove `ConversationGraph` for general calls

---

## Reference
- Outstanding implementation work: `docs/tracking/implementation.md`
- Test spec + implementation status: `docs/tracking/tests.md`
- PRD status: `docs/tracking/prds.md`
