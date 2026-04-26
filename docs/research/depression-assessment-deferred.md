# Depression Assessment — Deferred (PHQ-2 / GDS-15)

**Status:** Deferred from v1 demo. Captured here as future work so the design intent isn't lost.

**Related:**
- `docs/research/health-redesign.md` — health persona redesign (Change 1 originally proposed PHQ-2 inline)
- `docs/research/clinical-assessment-analysis.md` — clinical foundations
- `docs/decisions/adr-005-signal-independence.md` — signal architecture (depression assessment is separate from indirect signals)

## Why deferred

Adding a depression instrument to the demo path would imply we're screening for depression, which we are not. The product posture is non-clinical — we surface patterns to caregivers, we do not diagnose. Bolting a 2-item PHQ-2 onto every health check biases the call toward a mental-health assessment we don't have the clinical scaffolding to support yet.

The decision was: keep depression off the v1 surface entirely. When we revisit it, treat it as its own structured assessment with its own trigger logic — not as a sub-section of an unrelated call type.

## Future shape — when this comes back

### Two instruments, two roles

| Instrument | Items | Role | Trigger |
|---|---|---|---|
| PHQ-2 | 2-item screener (interest, mood) | Quick gate during a health-check call | Longitudinal: e.g. low-mood signals 3 sessions in a row |
| GDS-15 | 15-item geriatric depression scale | Standalone assessment, dedicated call type | PHQ-2 positive screen, or scheduled refresh |

PHQ-2 is the gate, GDS-15 is the assessment. PHQ-2 alone is not enough — a positive screen should escalate to the longer instrument, not become a standalone signal.

### Trigger ideas (longitudinal, not snapshot)

Per Global Rule 3 (trends override snapshots), depression triggering should be longitudinal, not reactive to a single bad call.

Sketch:

- **PHQ-2 trigger:** sustained low-mood signal across N sessions (e.g. 3 in a row) — could be derived from sentiment in transcripts, mood self-report fields, or care-team flagging.
- **GDS-15 trigger:** PHQ-2 positive screen, or scheduled cadence (quarterly?), or caregiver-initiated through the dashboard.
- **Separate call type:** `DEPRESSION_ASSESSMENT` as a sibling of `HEALTH_CHECK` and `COGNITIVE`. Lets the persona graph and prompts be designed around the instrument rather than wedged into a health-check flow.

### Schema sketch (not implemented)

When this lands it would mirror the Cognitive / Health pattern:

```prisma
model Phq2Result {
  id                String      @id @default(uuid())
  elderlyProfileId  String
  callLogId         String?     // null if administered async (e.g. dashboard form)
  interestScore     Int         // 0-3
  moodScore         Int         // 0-3
  totalScore        Int         // 0-6
  positiveScreen    Boolean     // total >= 3
  triggerReason     Phq2Trigger
  createdAt         DateTime    @default(now())
  // ...
}

model Gds15Result {
  id                String      @id @default(uuid())
  elderlyProfileId  String
  callLogId         String      // GDS-15 always lives in a dedicated call
  responses         Json        // 15 yes/no answers
  totalScore        Int         // 0-15
  severity          Gds15Severity  // NORMAL | MILD | MODERATE | SEVERE
  createdAt         DateTime    @default(now())
  // ...
}

enum Phq2Trigger {
  LONGITUDINAL_LOW_MOOD
  CAREGIVER_INITIATED
  SCHEDULED
}

enum Gds15Severity {
  NORMAL       // 0-4
  MILD         // 5-8
  MODERATE     // 9-11
  SEVERE       // 12-15
}
```

### Open questions for when this returns

- What signal(s) drive the "sustained low mood" trigger? Sentiment analysis of transcripts? Self-report mood field? Both?
- Where does GDS-15 sit in the call cadence? On-demand only, or part of a quarterly mental-health refresh?
- Does the dashboard get a "request depression assessment" caregiver action?
- How do we handle a positive screen — clinician escalation copy? Resource list? Both? This is a non-clinical product, so the answer can't be "we tell the user they're depressed."
- Cultural / language considerations for elderly populations who may underreport mood symptoms.

## Anti-goals

- Don't add PHQ-2 as a few extra questions inside the health check. It conflates screening with general wellbeing and biases the call.
- Don't surface a depression score in the dashboard without the trigger and assessment context. A raw PHQ-2 score in a graph is not informative on its own.
- Don't treat depression as an indirect signal pipeline. Indirect signals (per ADR-005) are passive measurements; depression assessment is an active, structured instrument.
