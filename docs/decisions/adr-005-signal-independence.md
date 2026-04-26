# ADR-005: Indirect Signal Pipelines Are Independent and Cross-Persona

**Status:** Accepted
**Date:** 2026-04-26

## Context

We are adding indirect cognitive signals — passive measurements extracted from call transcripts (e.g. lexical diversity, semantic coherence, response latency) — alongside the formal MoCA-derived cognitive scoring. The taxonomy is captured in `docs/research/indirect-signals.md`.

The core question is *how* these signals get computed and how they relate to each other and to the rest of the system. Three patterns were available:

- **Cascade pipeline** — signals computed sequentially, downstream signals consume upstream outputs (e.g. topic-switch derived from semantic coherence).
- **Persona-coupled extractors** — each persona's post-call processor owns and computes its own signals, with persona-specific schemas.
- **Independent extractors over a shared post-call surface** — every signal has its own pipeline, no signal consumes another, all run cross-persona.

The clinical posture also matters here. Because we are building a non-clinical product that surfaces patterns to caregivers, we cannot make diagnostic claims, and we cannot let one signal "explain" another in a way that creates causal-looking chains in the UI. This ruled out the cascade pattern early.

The persona-coupling pattern was tempting because the existing health and cognitive personas already have post-call processors. But signals like response latency, filler rate, and lexical diversity are not persona-specific — they are properties of any conversation. Locking them inside a single persona's processor would either duplicate code three ways or implicitly bias which signals show up where.

## Considered Options

| Option | Notes |
|---|---|
| **Cascade pipeline** | Sequential signal pipelines, downstream consumes upstream. Rejected — creates causal-looking chains, violates the no-diagnosis posture, and couples signal pipelines together. |
| **Persona-coupled extractors** | Each persona owns its signal extraction. Rejected — duplicates extraction logic, biases signal coverage by persona, and conflates persona behaviour with signal measurement. |
| **Independent extractors in `@naiber/shared-signals` (chosen)** | One package owns extractors. Each persona's post-call processor calls in. Each signal pipeline runs independently with its own confounders, confidence, and provenance. |

## Decision

**Chosen: independent signal extractors in a new `@naiber/shared-signals` package, invoked from each persona's post-call processor.**

### Global rules that govern every signal pipeline

These rules are normative — every extractor and every consumer must respect them.

1. **Signals do not explain each other.** Each signal is an independent measurement. A signal's value or meaning is determined only by its own inputs. No signal pipeline may consume another signal pipeline's output. Signals run in parallel. Any relationship between signals is expressed only at visualization or interpretation time — never at extraction time. Cross-signal correlation is not computed or persisted.

2. **Confounders reduce confidence, not value.** When something external may have affected a signal's reliability, the raw value is preserved and the signal's confidence is penalized. Confounders are logged per signal alongside the value so they surface downstream. **(v1 simplification — see below.)**

3. **Trends override snapshots.** Single measurements are contextual information, not signals. Only changes over time are treated as meaningful. Baselines are rolling. Alerts (where any exist) require multiple time points.

4. **The system describes, users interpret.** Output language describes patterns, not conditions. No diagnostic phrasing. Dashboards default to trend graphs over raw numbers. This is a legal posture, not a stylistic one.

### Architecture

```
shared-core
  → shared-clients (OpenAI embeddings, Redis)
    → shared-data (signal repository)
      → shared-services
        → shared-signals (NEW — extractors + sufficiency gate)
          → invoked from per-persona post-call processors
```

`shared-signals` exposes pure extractor functions (`extractLexicalDiversity`, `extractSemanticCoherence`, etc.) and a sufficiency-gate utility. Each extractor takes a normalized transcript shape and returns `{ rawValue, confidence, confounders[], provenance }`. The sufficiency gate is consulted by each extractor before persistence — if the gate fails, the signal is not surfaced (or surfaces with an explicit insufficient-data state).

### Cross-persona scope

Signal extraction runs as a post-call step for **all three personas** (general, health, cognitive). The live persona graphs and prompts are not modified — extraction happens after the call, on the stored transcript, in BullMQ-driven post-call processing. This honours the existing decision to leave the general persona behavioural surface as-is while still letting it contribute signal data.

### Confidence aggregation is deferred

Per-signal confidence is the source of truth. Session-level confidence will be a model-aggregated function over per-signal confidences, but the model is out of scope for v1 — the schema reserves a nullable session-confidence column that gets populated in a later phase.

## Consequences

**Positive:**
- Signal pipelines are independently testable and independently failable. A bug in one extractor does not corrupt the others.
- Cross-persona application means a single signal (say, response latency) has comparable values across all three personas — caregivers see the same metric whether it was captured during a health check or a general call.
- The shared-signals package gives signals a single, discoverable home and reduces the persona-post-call processors to thin wrappers that call extractors and persist.
- The no-cascade rule keeps the dashboard layer free to add or change interpretation without breaking extraction. Domain mapping (e.g. "this signal cluster relates to memory") lives at the dashboard, not in the extractors.
- Legal posture is enforced at the architectural layer: there is no place in the data flow where one signal's output gets used to explain another's value, which is what creates diagnostic-feeling chains in UIs.

**Negative / Trade-offs:**
- Some extractors will share confounders (fatigue affects both speech rate and lexical diversity) but cannot read each other's confounders. Each pipeline must detect and log its own. This is intentional — the alternative is cross-pipeline state, which is exactly what the rules prohibit — but it does mean some duplication of confounder-detection logic.
- Cross-persona scope means extraction logic must be persona-agnostic. Anything that needs persona context (e.g. "lower expected response latency during cognitive tasks") must live at the interpretation layer, not in the extractor.
- Trend signals (rolling averages, deltas vs baseline, drift detection) are deferred along with RCI to a later phase. The demo surfaces per-call signals only — multi-session pattern surfaces are a follow-up.
- Audio-dependent signals (prosody, pause timing, fluency) are also deferred. The current pipeline does not retain raw audio for post-call analysis, so the v1 signal list is transcript-only.

## v1 simplifications

These narrow Rule 2's scope for the v1 demo. The architectural posture is unchanged — we are deferring implementation, not the rule.

- **Confounder detection and confidence penalty deferred.** v1 extractors do not detect confounders. `IndirectSignal.confounders` is populated as `[]`. `confidence` is set to `1.0` whenever `sufficiencyMet = true` and the signal is not persisted otherwise. The `confidence` and `confounders` columns remain in the schema for v1.next; no migration will be needed when the detection pipeline lands. Full design (penalty tiers, special cases like nulling response latency under network spikes, calibration plan) is captured in `docs/research/confounder-penalties-deferred.md`.
- **Sufficiency gating stays inline, not centralised.** Each extractor handles its own minimum-data check (writing `sufficiencyMet` and `insufficiencyReason`). There is no shared sufficiency-gate utility in v1. Thresholds default to the values in `docs/research/indirect-signals.md`.

## Out of scope for this ADR

- Topic-switch and semantic-drift detection — both require LLM classification, which we are not adding for v1. They are documented in `indirect-signals.md` as deferred.
- The interpretation/dashboard layer that maps signals to MoCA domains. That is a separate decision when the dashboard is designed.
- Audio-pipeline retention and prosody extraction. Out of scope until raw audio is captured.

## References

- `docs/research/indirect-signals.md` — full taxonomy + Global Rules + signal table
- `docs/research/cognitive-improvements.md` — cognitive scoring improvements (C1–C5)
- `docs/research/health-redesign.md` — health persona redesign + cross-persona signal sharing
- `docs/research/clinical-assessment-analysis.md` — source of truth for clinical thresholds and formulas
