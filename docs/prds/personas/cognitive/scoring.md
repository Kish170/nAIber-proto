# Cognitive Scoring

## Purpose
Validates and scores each cognitive task using NLP (compromise) and LLM-based classification. Computes domain scores and a weighted stability index.

## Per-Task Validation (TaskValidation)

### Orientation
- Scores day, date, month, year, season separately (1pt each, max 5)
- Fuzzy matching via NLP number extraction
- Seasonal tolerance: overlapping months (e.g., "spring" valid Feb-May)

### Word Registration
- Extracts nouns from response, checks if all 5 target words present
- Max 1 retry if partial (`registrationAttempts < 1`)
- Output: `registrationComplete`, `registrationQuality` ('complete'|'partial'), `wordsRepeated`, `wordsMissed`

### Digit Span (Forward & Reverse)
- Forward: lengths 3, 4, 5 (2 trials per length: A then B). Max score: 5
- Reverse: lengths 3, 4 (2 trials per length). Max score: 4
- Score = longest consecutive correct sequence length

### Serial 7s
- Target: [93, 86, 79, 72, 65] (subtract 7 from 100, 5 times)
- Non-cascading validation: each step scored against user's prior answer
- Alternative: if user indicates inability → switch to WORLD Backward (D-L-R-O-W). Max score: 5

### Letter Vigilance
- Count target letter 'A' in 26-letter sequence
- Score = `max(0, A_count - |user_count - A_count| - false_positives)`. Max score: 6

### Letter Fluency
- Words starting with assigned letter (F, A, or S) in ~60 seconds
- Rules: no proper nouns, no numbers, no repetitions
- Score = valid word count (uncapped)
- Tracks perseveration signals: repetitions, phonetic clusters, intrusions

### Abstraction
- 2 item pairs, scored per pair: Abstract (2) | Concrete (1) | None (0)
- Checked against hardcoded example lists first, then LLM classification. Max score: 4

### Delayed Recall (3 phases)
- **Free recall**: 2 pts/word recalled (max 10)
- **Cued recall**: 1 pt/word (category cue provided for missed words)
- **Recognition**: 0 pts/word (multiple choice: target + 2 foils)
- Phases cascade: only proceed to next if words still missing

## Domain Score Computation (ScoringEngine)

| Domain | Components | Max |
|--------|-----------|-----|
| Orientation | Orientation task | 5 |
| Attention/Concentration | Digit span forward + Serial 7s + Letter vigilance | 16 |
| Working Memory | Digit span reverse | 4 |
| Delayed Recall | Delayed recall task | 10 |
| Language/Verbal Fluency | Letter fluency / personal best (needs ≥3 sessions) | self-relative |
| Abstraction/Reasoning | Abstraction task | 4 |

## Stability Index (Weighted Composite)

| Domain | Weight |
|--------|--------|
| Delayed Recall | 0.30 |
| Attention/Concentration | 0.20 |
| Working Memory | 0.15 |
| Language/Verbal Fluency | 0.15 |
| Abstraction/Reasoning | 0.10 |
| Orientation | 0.10 |

**Adjustments:**
- No fluency baseline (< 3 sessions): redistribute fluency weight pro-rata
- Partial word registration: reduce delayed recall weight 0.30 → 0.15, redistribute

**Calculation:** `stability = Σ(normalized_score × weight) / Σ(weights)` → 0.0 to 1.0

## Current Status
Fully implemented in `ScoringEngine.ts` and `TaskValidation.ts`.

## Related Docs
- [Cognitive Assessment](./assessment.md)
- [Baseline & Drift](./baseline-drift.md)
