# Baseline & Drift Detection — Test Spec

Reference PRD: [baseline-drift.md](../../../prds/personas/cognitive/baseline-drift.md)

## Layer 2: Integration Tests

### Baseline Update (EWMA)
- First test: baseline = current domain scores (no blending)
- Second test: `new_baseline = 0.3 * current + 0.7 * previous` per domain
- Version increments with each update (1, 2, 3, ...)
- Skipped when assessment is deferred (`isDeferred: true`)
- Skipped when assessment is partial (`isPartial: true`)

### Drift Detection
- With < 3 completed tests: returns null (not enough data)
- With 3 tests, mean stability ≥ 0.80: category `'stable'`
- With 3 tests, mean stability 0.65-0.79: category `'monitor'`
- With 3 tests, mean stability 0.50-0.64: category `'notable'`
- With 3 tests, mean stability < 0.50: category `'significant'`
- Window uses 3 most recent completed (non-deferred, non-partial) tests only

### Fluency Personal Best
- With < 2 prior tests: personal best not computed (fluency excluded from scoring)
- With 2+ prior tests: personal best = max fluency score across history
- Current fluency normalized: `current / personal_best` (capped at 1.0)
- New personal best recorded when current exceeds previous

### Edge Cases
- All tests deferred: no baseline exists, no drift computed
- Mix of partial and complete: only complete tests count for drift window
- Stability index exactly at category boundary (e.g., 0.80): falls into higher category ('stable')

## Test Approach
- Seed CognitiveTestResult records with known stability indices
- Seed CognitiveBaseline records with known domain scores
- Call `computeBaselineUpdate()` and `detectDrift()`
- Verify baseline blending arithmetic and drift categorization
