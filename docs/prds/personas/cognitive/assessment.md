# Cognitive Assessment

## Purpose
`CognitiveGraph` delivers a 9-task cognitive battery via conversational durable execution. Includes a wellbeing gate, content rotation to prevent practice effects, and NLP-based validation per task type.

## Assessment Flow

### Wellbeing Gate (3 questions)
Before tasks begin, 3 wellbeing questions are asked:
1. "How are you feeling today overall?"
2. "Have you had a chance to sleep okay recently?"
3. "Is there anything on your mind today?"

**Distress keywords** (trigger deferral): `pain, unwell, sick, terrible, awful, can't do this, very tired, exhausted, hurting`

**Exit keywords**: `i have to go, i need to go, stop, end, quit, i'm done, i am done, goodbye, bye`

### 9-Task Battery (TASK_SEQUENCE)

| # | Task | Domain | Max Score |
|---|------|--------|-----------|
| 1 | Orientation | ORIENTATION | 5 |
| 2 | Word Registration | DELAYED_RECALL | null (encoding only) |
| 3 | Digit Span Forward | ATTENTION_CONCENTRATION | 5 |
| 4 | Digit Span Reverse | WORKING_MEMORY | 4 |
| 5 | Serial 7s | ATTENTION_CONCENTRATION | 5 |
| 6 | Letter Vigilance | ATTENTION_CONCENTRATION | 6 |
| 7 | Letter Fluency | LANGUAGE_VERBAL_FLUENCY | null (uncapped) |
| 8 | Abstraction | ABSTRACTION_REASONING | 4 |
| 9 | Delayed Recall | DELAYED_RECALL | 10 |

### Content Rotation (CognitiveHandler + ContentRotation)
Session index = completed test count (0-based, modulo rotation):
- **Word lists** (5 lists A-E): face/silk/church/daisy/red, arm/velvet/castle/lily/green, etc.
- **Digit sets** (3 sets): forward 3-4-5 digits, reverse 3-4 digits
- **Fluency letters** (3): F, A, S
- **Abstraction pairs** (3 sets): train/bicycle, apple/banana, river/lake, etc.
- **Vigilance letters** (3 sets): 26-letter sequences with 6 A's at varying positions

## Durable Execution
- Checkpointer: `ShallowRedisSaver`
- Thread ID: `cognitive:{userId}:{conversationId}`
- Interrupts after each task prompt, resumes with `Command({ resume: userAnswer })`

## Session Outcomes

| Outcome | Trigger | State Flags |
|---------|---------|-------------|
| Complete | All 9 tasks finished | `isComplete: true` |
| Deferred (distress) | Distress keyword in wellbeing | `isDeferred: true, deferralReason: 'distress_detected'` |
| Deferred (declined) | User declines during wellbeing | `isDeferred: true, deferralReason: 'user_declined'` |
| Partial | Exit keyword during tasks | `isPartial: true` |

## 6 Cognitive Domains
- ORIENTATION
- ATTENTION_CONCENTRATION (digit span forward + serial 7s + letter vigilance)
- WORKING_MEMORY (digit span reverse)
- DELAYED_RECALL (word registration + delayed recall)
- LANGUAGE_VERBAL_FLUENCY (letter fluency)
- ABSTRACTION_REASONING (abstraction)

## Current Status
Fully implemented. 9-task battery with content rotation, NLP validation, and durable execution.

## Related Docs
- [Cognitive Scoring](./scoring.md)
- [Cognitive Baseline & Drift](./baseline-drift.md)
- [Cognitive Post-Call](./post-call.md)
- [Cognitive PRD (product-level)](../cognitive.md)
