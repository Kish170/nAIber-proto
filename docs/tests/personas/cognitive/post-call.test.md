# Cognitive Post-Call — Test Spec

Reference PRD: [post-call.md](../../../prds/personas/cognitive/post-call.md)

## Layer 1: E2E Smoke
- After cognitive call + post-call: CognitiveTestResult exists in Postgres
- Baseline record created or updated
- Checkpoint thread deleted from Redis

## Layer 2: Integration Tests

### State Extraction (PostCallWorker)
- Reads checkpoint state from ShallowRedisSaver using thread ID `cognitive:{userId}:{conversationId}`
- Extracts: `taskResponses`, `wellbeingResponses`, `sessionIndex`, content selection fields
- Extracts flags: `distressDetected`, `isPartial`, `isDeferred`, `deferralReason`
- Defaults all fields to safe values when missing from checkpoint
- Returns `{ success: false }` when no checkpoint state found

### compute_scores
- Skips when `isDeferred: true`
- Fetches 5 prior completed tests for fluency personal best
- Outputs `domainScores` and `stabilityIndex` via state channels
- With no prior tests: fluency excluded from stability computation

### persist_results
- Creates CognitiveTestResult with task responses, wellbeing responses, domain scores, stability index
- Stores content rotation IDs (word list, digit set, letter, abstraction set, vigilance set)
- Stores flags: `isPartial`, `isDeferred`, `distressDetected`
- Skips if prior node produced errors

### update_baseline
- Skips if deferred or partial
- First test: creates baseline with version 1
- Subsequent: blends with EWMA (alpha=0.3), increments version

### check_drift
- Skips if deferred or partial
- With ≥3 completed tests: computes drift category
- `notable` or `significant`: logs action required (notification TODO)

### Thread Cleanup
- Checkpoint thread deleted after successful persistence
- Thread preserved on failure (allows retry)

## Layer 3: LangSmith
- Trace 4-node post-call graph: compute_scores → persist_results → update_baseline → check_drift
- Inspect domain score computation inputs and outputs
- Verify stability index calculation

## Test Approach
- Seed checkpoint state with known task responses and wellbeing answers
- Invoke PostCallWorker.processCognitiveJob()
- Verify CognitiveTestResult in Postgres (scores, flags, content IDs)
- Verify CognitiveBaseline (version, domain scores)
- Test: complete assessment, deferred assessment, partial assessment
