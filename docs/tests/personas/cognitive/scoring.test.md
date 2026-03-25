# Cognitive Scoring — Test Spec

Reference PRD: [scoring.md](../../../prds/personas/cognitive/scoring.md)

## Layer 2: Integration Tests

### Orientation Validation
- Correct day, date, month, year, season → score 5/5
- One wrong (e.g., wrong month) → score 4/5
- Fuzzy: "twenty-fourth" → matches date 24
- Season tolerance: "spring" valid in Feb-May

### Word Registration Validation
- All 5 words repeated → `registrationComplete: true`, `registrationQuality: 'complete'`
- 3 of 5 words, first attempt → retry (`registrationComplete: false`)
- 3 of 5 words, second attempt → `registrationQuality: 'partial'`, proceed

### Digit Span Validation
- Forward: correct 3-digit, correct 4-digit, fail 5-digit trial A, correct 5-digit trial B → score: 5
- Forward: correct 3, fail both 4-digit trials → score: 3
- Reverse: correct 3, correct 4 → score: 4
- Reverse: fail all → score: 0

### Serial 7s Validation
- [93, 86, 79, 72, 65] all correct → score 5/5
- Non-cascading: [93, 85, 78, 72, 65] → 85 wrong, but 78 correct relative to 85 → score 4/5
- WORLD backward alternative ("DLROW") → score based on correct letters

### Letter Vigilance Validation
- User correctly counts all 6 A's → score 6/6
- User says 5 (missed 1) → score 5/6
- User says 8 (2 false positives) → `max(0, 6 - |6-8| - 2)` = 2

### Letter Fluency Validation
- 12 valid words, no repeats → score: 12
- 10 valid + 2 proper nouns + 1 repeat → score: 10
- Perseveration signals tracked: 3+ words with same prefix flagged

### Abstraction Validation
- Abstract answer ("both are vehicles") → 2 points
- Concrete answer ("both have wheels") → 1 point
- No valid answer → 0 points
- Checks hardcoded examples first, then LLM classification

### Delayed Recall Validation
- Free recall: 4 of 5 words → 8 points (2 pts/word)
- Cued recall: missed word recalled with category cue → +1 point
- Recognition: missed word selected from choices → +0 points (but confirmed)
- Phases cascade: only proceed to cued if free recall incomplete

### Domain Score Computation
- Attention/Concentration = digit forward + serial 7s + vigilance (max 16)
- Each domain normalized to 0-1 scale
- Fluency: normalized against personal best (needs ≥3 sessions, otherwise excluded)

### Stability Index
- Weighted sum: delayed recall 30%, attention 20%, working memory 15%, fluency 15%, abstraction 10%, orientation 10%
- No fluency baseline: fluency weight redistributed pro-rata
- Partial registration: delayed recall weight drops 0.30 → 0.15
- Output range: 0.0 to 1.0

## Test Approach
- Unit test `TaskValidation` methods with known inputs/expected outputs
- Unit test `ScoringEngine.computeDomainScores()` and `computeStabilityIndex()`
- Test weight redistribution edge cases
