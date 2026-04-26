# Confounder-Driven Confidence Penalties — Deferred from v1

**Status:** Deferred from v1 demo. Captured here as the agreed v1.next design so the intent isn't lost.

**Related:**
- `docs/research/indirect-signals.md` — taxonomy + Global Rules
- `docs/decisions/adr-005-signal-independence.md` — Global Rule 2 governs this work
- `prisma/schema.prisma` — `IndirectSignal.confounders` Json column (already in place; populated as `[]` in v1)

## Why deferred

ADR-005's Global Rule 2 says confounders reduce confidence, not value. The full implementation requires per-extractor confounder detection logic, a schema for confounder objects, an additive penalty pipeline, and (eventually) empirical calibration of the penalty values. None of that lands meaningful UX value for the v1 demo — the dashboard is showing per-call signal trends, not confidence-weighted aggregates.

What v1 keeps from Rule 2:

- **Raw values are preserved.** Extractors return the measured value as-is. (Same as the rule.)
- **Sufficiency gating.** Each extractor still flips `sufficiencyMet = false` and writes `insufficiencyReason` when its minimum-data check fails. Insufficient signals are not surfaced.

What v1 defers:

- **Confounder detection.** No extractor inspects audio quality, time-of-day, accent flags, or any other confounder source.
- **Confidence penalty.** v1 sets `confidence = 1.0` when `sufficiencyMet = true`. The `confidence` field is reserved for v1.next.
- **`confounders` column population.** Stored as `[]` in v1. Schema preserved; no migration required when v1.next adds detection.

The full design below is what we'll implement when this returns.

## v1.next design — categorical tiers, not precise floats

Define penalty tiers based on how severely a confounder affects each signal's reliability, and set conservative starting values. These will be calibrated from real data after enough sessions accumulate.

| Confounder | Severity | Starting Penalty | Signals Most Affected |
|---|---|---:|---|
| Background noise (detected) | High | −0.30 | Disfluency, lexical diversity, semantic coherence |
| Network latency spike (>500ms) | High | −0.40 | Response latency (may be entirely invalidated) |
| Accent (non-native English, flagged at onboarding) | Medium | −0.15 | Lexical diversity, disfluency rate |
| Topic constraint (structured task vs. open conversation) | Medium | −0.15 | Lexical diversity, syntactic complexity |
| Exploratory thinking style (flagged by response pattern) | Low | −0.10 | Semantic coherence, disfluency |
| Fatigue (late call time, slow responses, short utterances) | Medium | −0.20 | All signals |
| First session (no baseline yet) | High | −0.25 | All trend-dependent signals |
| Partial session (call ended early) | High | −0.30 | All signals; may fail sufficiency gate entirely |

## Design decisions for the implementing agent

- **Penalties are additive, not multiplicative.** Multiple confounders stack. Floor `confidence` at `0.10`, never zero, so the session is still logged.
- **Response latency is a special case.** If network latency is flagged, the latency signal should be **nulled** for that session, not just penalised — you cannot distinguish network delay from cognitive delay.
- **Accent is per-user static.** Set at onboarding via a flag on `ElderlyProfile`; not detected per-session. The extractor reads it from profile state, not from the transcript.
- **Background noise is detected heuristically.** A simple v1.next proxy: ElevenLabs reporting low audio quality on the turn payload, or unusually high silence ratios. Real prosody-based detection waits until raw audio is retained.
- **Calibration cadence.** After 30+ sessions per user, run correlation analysis between confounder flags and observed signal variance. Use the empirical correlations to adjust penalty values. The starting values above are placeholders, not commitments.

## Cross-cutting consequences

- **Schema.** No new schema work is needed when v1.next ships. `IndirectSignal.confounders` is already a `Json` column shaped for `[{ name, weight, evidence? }]` objects.
- **Extractor signature.** Stays the same: `{ rawValue, confidence, confounders[], provenance }`. v1 returns `confidence: 1.0` and `confounders: []`. v1.next computes both.
- **ADR-005 Global Rule 2.** Still binding. v1 honours its first half (raw values preserved) and defers its second half (confidence penalty + confounder logging). The deferral is documented inline in ADR-005's "v1 simplifications" section.

## Out of scope for this doc

- The audio-pipeline retention work that unlocks proper background-noise / prosody confounder detection. Tracked under ADR-005's broader audio-pipeline deferral.
- Empirical calibration methodology. Sketched here as "correlation analysis after 30+ sessions per user," but the actual stats methodology (z-scores, robust regression, etc.) is a v1.next decision.
- Confidence aggregation at the session level. ADR-005 already reserves `CognitiveTestResult.sessionConfidence` as nullable for this; the aggregation function lives in a later phase regardless.
