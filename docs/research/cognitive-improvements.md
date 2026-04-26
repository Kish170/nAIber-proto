# Cognitive Persona Improvements

The current call orchestration and exercise battery is considered sufficient for now. Do not redesign the call flow or add new exercises unless a clear gap in domain coverage is identified after reviewing the existing tasks against MoCA domains. Flag any gaps found.

The improvements are focused entirely on **scoring quality and clinical validity**.

## 1. Demographic-Adjusted Scoring

- Implement education and age normalization for cognitive scores.
- `educationLevel` is already captured at onboarding but never used in scoring — wire it in.
- Reference Rossetti 2011 and Borland 2017 normative data from the research document for adjustment values.
- Age 85+ shows expected decrements in delayed recall and fluency — account for this in thresholds.

## 2. First-Test Anxiety Adjustment

- First test performance is commonly depressed by anxiety in elderly users — using it as a permanent baseline anchors too low.
- Implement baseline initialization that blends IQCODE-style informant priors (from onboarding data) with first test scores rather than treating first test as ground truth.

## 3. Reliable Change Index

- Replace current arbitrary drift thresholds (0.80 / 0.65 / 0.50) with RCI computation per domain.
- Formula from research document: `z = (X2 - X1) / sqrt(2 * SEM²)`
- Per-domain variance tracking is required to support this — plan how this gets stored and updated across sessions.

## 4. Confounding Condition Detection

Before interpreting any score change as cognitive decline, check for confounding signals from the health persona via Redis:

- Depression (PHQ-2 / GDS-15 scores)
- Medication changes
- Poor sleep
- Acute illness or infection
- ADHD history (from onboarding)
- Hearing loss (self-report + response pattern)

A declining score in the presence of an active confounding condition should be flagged differently than clean decline — lower confidence weight, different escalation tier.

## 5. Session Confidence Scoring

- Implement a per-session confidence score (0–1) that reflects how reliable that session's results are.
- Factors: partial completion, detected confounders, first-test flag, response pattern anomalies.
- Low-confidence sessions contribute less weight to baseline and drift calculations.

## Cross-Persona Requirements

- Health and cognitive post-call pipelines must share signals via Redis with a 30-day TTL.
- **Health → Cognitive:** depression flags, IADL difficulties, sleep quality, medication changes.
- **Cognitive → Health:** drift alerts trigger deeper IADL and self-reported change questions next health call.
- Web onboarding should recommend (not require) completing a health check-in before the first cognitive assessment — surface this as a suggestion with explanation that health data improves cognitive score accuracy.

## Implementation Notes

- This will be implemented across multiple Claude Code sessions on separate worktrees in parallel.
- Plan each improvement as a discrete implementable unit so sessions do not overlap or conflict.
- Do not modify the general persona, MCP server, or RAG pipeline as part of this work.
- Use the AskUserQuestion tool if clinical thresholds, scoring formulas, or schema decisions need clarification before implementing.
- Reference `docs/research/clinical-assessment-analysis.md` for all clinical values, formulas, and instrument specifications — do not invent thresholds.
