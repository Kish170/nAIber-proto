# Cognitive Post-Call

## Purpose
Processes cognitive assessment results after call end: computes scores, persists results, updates baseline, and checks for drift.

## Graph Structure (Sequential)
```
compute_scores → persist_results → update_baseline → check_drift → END
```

## Nodes

### compute_scores
- Skips if deferred
- Fetches 5 prior completed tests for fluency personal best calculation
- Calls `ScoringEngine.computeDomainScores()` and `computeStabilityIndex()`
- Outputs: `domainScores`, `stabilityIndex`

### persist_results
- Calls `CognitiveRepository.createTestResult()` with:
  - Task responses, wellbeing responses, domain scores, stability index
  - Content rotation IDs (word list, digit set, letter, abstraction set, vigilance set)
  - Flags: `isPartial`, `isDeferred`, `distressDetected`
- Skips if errors exist

### update_baseline
- Skips if deferred or partial
- Fetches current baseline (or null for first test)
- Calls `ScoringEngine.computeBaselineUpdate()` — EWMA with alpha=0.3
- Increments version, persists new baseline

### check_drift
- Skips if deferred or partial
- Fetches 3 most recent completed tests
- Calls `ScoringEngine.detectDrift()`
- If `notable` or `significant`: logs action required (TODO: notify contacts)

## Input (from PostCallWorker)
PostCallWorker extracts from checkpoint state:
- `taskResponses`, `wellbeingResponses`, `sessionIndex`
- Content selection fields: `selectedWordList`, `selectedDigitSet`, `selectedLetter`, etc.
- Flags: `distressDetected`, `isPartial`, `isDeferred`, `deferralReason`
- Defaults all fields to safe values if missing

## Current Status
Fully implemented in `CognitivePostCallGraph.ts`. Domain scores flow through state channels (`domainScores`, `stabilityIndex`).

## Related Docs
- [Cognitive Assessment](./assessment.md)
- [Cognitive Scoring](./scoring.md)
- [Baseline & Drift](./baseline-drift.md)
- [Post-Call Worker](../../ai-orchestration/post-call-worker.md)
