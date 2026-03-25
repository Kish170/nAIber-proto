# Baseline & Drift Detection

## Purpose
Tracks cognitive stability over time using exponential moving average baselines and rolling-window drift detection.

## Baseline Update (EWMA)

After each completed (non-deferred, non-partial) assessment:

```
new_baseline[domain] = alpha × current_score + (1 - alpha) × previous_baseline
```

- **Alpha:** 0.3 (30% weight to new session, 70% to history)
- First test: baseline = current domain scores (no history to blend)
- Version incremented with each update

## Drift Detection (Rolling Window)

Requires ≥3 recent completed tests.

Computes rolling mean of stability indices across the window (`windowSize = 3`).

| Category | Stability Range | Action |
|----------|----------------|--------|
| `stable` | ≥ 0.80 | No action |
| `monitor` | 0.65 – 0.79 | Observation recommended |
| `notable` | 0.50 – 0.64 | May warrant intervention |
| `significant` | < 0.50 | Action needed |

## Fluency Personal Best
- Requires ≥2 prior completed tests (3+ total sessions)
- Personal best = maximum fluency score across previous sessions
- Current fluency normalized as `current_score / personal_best` (capped at 1.0)
- Used in domain scoring and stability index computation

## Outstanding Work
- `notable`/`significant` drift: create Notification record (not yet implemented)
- Distress detection → SMS to emergency contact via Twilio (not yet implemented)

## Current Status
Fully implemented in `ScoringEngine.ts`. Drift detection runs in `CognitivePostCallGraph` (check_drift node). Notification triggers are TODO.

## Related Docs
- [Cognitive Scoring](./scoring.md)
- [Cognitive Post-Call](./post-call.md)
