# ADR-006: C2 — IQCODE Informant Prior Blends Into Cognitive Baseline (Not Displayed Scores)

**Status:** Accepted
**Date:** 2026-04-26

## Context

C2 in `docs/research/cognitive-improvements.md` proposes blending IQCODE-style informant priors with first-test cognitive scores to mitigate first-test anxiety distorting the personal baseline. First-test scores in elderly users are commonly depressed by anxiety and protocol novelty; using them as ground truth anchors the baseline too low.

The schema already supports informant data:

- `TrustedContact.informantConcernIndex` — `rawScore / 21`, where `rawScore` sums 7 IQCODE-style structured questions (each 0–3 points). 0 = no concern, 1 = max concern.
- `TrustedContact.weightedInformantIndex` — `informantConcernIndex × reliabilityWeight`, where tier weights are `1.0` (spouse / adult child / 10+ yr) / `0.75` (close friend / 5–10 yr) / `0.50` (professional caregiver / recent contact).
- `TrustedContactSubmission.rawScore` and `informantConcernIndex` — per-submission raw values, rolled up onto `TrustedContact` by `TrustedContactRepository.updateConcernIndex()`.

There was a doc conflict to resolve before designing C2:

- `docs/research/cognitive-improvements.md` (C2) proposes blending the informant prior into baseline math.
- `docs/prds/personas/cognitive.md` explicitly states the informant concern index is "displayed in parallel, never blended" with cognitive scores — a posture meant to protect the user-visible score from being silently adjusted.

This ADR resolves the conflict and locks the C2 policy.

## Considered Options

| Option | Notes |
|---|---|
| **Adjusted first score** | C2 outputs a modified first MoCA score that gets persisted/displayed. Rejected — silently overwrites measured values, conflicts with the PRD's "never blended" rule, and loses raw measurement. |
| **No blending — keep PRD as-is** | Drop C2 entirely. Reasonable since C3 (baseline locks at 3 calls) already smooths first-call noise via averaging. Rejected because the first-test anxiety effect is well-documented and worth hedging against, and the schema already carries the data. |
| **Baseline-contribution weight (chosen)** | C2 outputs a weight (0.5 / 0.75 / 1.0) on how much the first call contributes to the locked baseline. Raw per-call scores untouched. PRD's "never blended" rule preserved for displayed scores. |

## Decision

**Chosen: C2 produces a baseline-contribution weight that modulates how much call 1 contributes to the locked cognitive baseline. Raw per-call scores are never modified.**

The PRD's "never blended" rule is reinterpreted: it applies to *displayed scores*, not to baseline-establishment math. The dashboard's existing parallel-track discrepancy display (informant concern shown alongside, but not merged into, cognitive scores) continues to operate exactly as the PRD describes.

### Resolved policy

| Decision | Resolution |
|---|---|
| What C2 produces | A weight `w₁ ∈ {0.5, 0.75, 1.0}` applied to call 1's contribution to the locked baseline. Raw `CognitiveTestResult` rows are not modified. |
| Input | `TrustedContact.weightedInformantIndex` (already tier-discounted; consumers do not duplicate tier logic). |
| Weight function | Step function with three bands. |
| Calls affected | Call 1 only. Calls 2 and 3 contribute at weight `1.0` regardless of informant. |
| No-data fallback | When no `weightedInformantIndex` exists for the primary caregiver, default to the middle band (`0.75`). |
| Multi-informant aggregation | Not applicable — only the primary caregiver may submit an IQCODE. Enforced by `TrustedContact.isPrimary`. |

### Step function

```
weightedInformantIndex < 0.3            →  w₁ = 0.5
0.3 ≤ weightedInformantIndex < 0.7      →  w₁ = 0.75
weightedInformantIndex ≥ 0.7            →  w₁ = 1.0
weightedInformantIndex == null          →  w₁ = 0.75   (no-data fallback)
```

### Baseline math

`CognitiveBaseline` aggregates the first three call results into a locked baseline. With C2 in place:

```
baselineDomainScore[d] = Σᵢ wᵢ × sessionScore[i, d]   for i ∈ {1, 2, 3}
                       / Σᵢ wᵢ

where:
  w₁ = step(primaryTrustedContact.weightedInformantIndex)
  w₂ = 1.0
  w₃ = 1.0
```

After call 3 lands and `baselineLocked = true`, C2 has no further effect on baseline math.

### Why call 1 only

The first-test anxiety / novelty effect is strongest on call 1 and largely washes out by call 3 as the user becomes familiar with the protocol. Confining the prior to call 1 is the most parsimonious story — C2's whole motivation is first-test anxiety, so confining the modulation to the first test is honest. C3 (baseline locks at 3 calls, see schema fields `callsIncluded` and `baselineLocked`) already does the heavy lifting of smoothing across the first three calls; C2 just needs to make sure the noisiest call doesn't dominate.

A graded decay (call 1 full-strength, call 2 half-strength, call 3 none) was considered and rejected as overfitting an arbitrary curve.

### Why `weightedInformantIndex` and not raw `informantConcernIndex` + tier

`weightedInformantIndex` was added to the schema specifically so consumers wouldn't each redo the tier-weighting step. C2 respects that. If the tier-weighting logic itself ever needs to change, the fix lives in `TrustedContactRepository.updateConcernIndex()`, not in parallel logic inside C2.

### Why single primary caregiver, not multi-informant aggregation

Multi-informant aggregation introduces choices (max / mean / weighted-mean / most-recent / highest-tier) that all have edge cases — a single dissenting low-concern informant can either silence a real alarm (mean) or be ignored entirely (max). Restricting submission to a single designated primary caregiver per elder removes the aggregation question and keeps the IQCODE signal sourced from the most-attuned-and-trusted observer. Operationalised via the new `TrustedContact.isPrimary` flag.

## Schema impact

This ADR adds one column:

```prisma
model TrustedContact {
  // ...
  isPrimary  Boolean  @default(false)
  // ...
  @@index([elderlyProfileId, isPrimary])
}
```

Application-level invariant: exactly one `TrustedContact` per `ElderlyProfile` has `isPrimary = true` (after onboarding). The DB does not enforce uniqueness directly; the API layer (`observations.router.ts` and the caregiver-onboarding flow) is responsible for keeping the invariant.

No other schema changes — `weightedInformantIndex`, `CognitiveBaseline.callsIncluded`, and `CognitiveBaseline.baselineLocked` are already in place from Phase 0.

## Consequences

**Positive:**
- Raw per-call cognitive scores remain immutable. The `CognitiveTestResult` table is the source of truth for what the user actually scored on a given call. C2's effect is confined to a derived aggregation, which is the right place for it.
- The PRD's parallel discrepancy display continues to work unchanged — the "stable assessments + high informant concern → caregiver review" track survives intact.
- The step function is interpretable in caregiver-facing language: "high informant concern" / "moderate" / "low," each with a defined effect on the baseline.
- C2 is independent of C3 in code: C3 still locks the baseline at 3 calls; C2 is a one-line modulation to `w₁` in the aggregation. No coupling in the implementation.
- Restricting IQCODE submission to the primary caregiver eliminates an entire class of aggregation edge cases without losing the signal.

**Negative / Trade-offs:**
- The step function thresholds (0.3, 0.7) and the band values (0.5, 0.75, 1.0) are defensible round numbers but not empirically calibrated. They are good v1 starting points; revisit when there is enough data to validate.
- Elders without a primary caregiver get the no-data fallback (`0.75`) for every first-call baseline. If onboarding never registers a caregiver, the elder permanently misses out on either anxiety-protection (low-concern signal pulling weight down) or score-corroboration (high-concern signal pulling weight up). This is acceptable for v1.
- Changing the primary caregiver mid-life-of-account requires `updateConcernIndex()` to recompute the rollup against the new primary's submissions. Old submissions remain on disk for audit. This is a deferred implementation detail, not a v1 blocker.
- `TrustedContact.isPrimary` is enforced at the application layer, not the database. A bug in the API layer could create two primaries; the index `[elderlyProfileId, isPrimary]` makes the bug detectable but not impossible.

## Out of scope for this ADR

- Empirical calibration of the step function thresholds and band values.
- Per-domain IQCODE prior. The current 7-question instrument is composite-only; mapping items to MoCA domains would require a different instrument and a new schema. Not in v1.
- Extending C2 to calls 2–3 with a graded decay. Considered and rejected; revisit only if data shows novelty effects persisting past call 1.
- Live mid-call use of the informant prior (e.g. cognitive persona reads `weightedInformantIndex` before deciding scoring posture). Out of scope under ADR-005's "no live cross-persona signal channel in v1" decision.
- The dashboard's discrepancy track UX. That lives in `docs/prds/personas/cognitive.md` and is unchanged by this ADR.

## References

- `docs/research/cognitive-improvements.md` — C1–C5 cognitive scoring improvements (C2 source)
- `docs/prds/personas/cognitive.md` — cognitive persona PRD, including the parallel discrepancy display
- `docs/decisions/adr-005-signal-independence.md` — signal architecture (relevant for the no-live-channel posture)
- `prisma/schema.prisma` — `TrustedContact`, `TrustedContactSubmission`, `CognitiveBaseline`, `CognitiveTestResult`
