# Cognitive Assessment — Test Spec

Reference PRD: [assessment.md](../../../prds/personas/cognitive/assessment.md)

## Layer 1: E2E Smoke
- Cognitive call completes (wellbeing check + at least some tasks)
- SupervisorGraph routes to `cognitive_call`
- `durable_execution_active` checkpoint passes
- After post-call: CognitiveTestResult exists in Postgres

## Layer 2: Integration Tests

### Wellbeing Gate
- 3 wellbeing questions asked in sequence before tasks
- No distress keywords → proceeds to tasks (`currentPhase: 'tasks'`)
- Distress keyword ("I'm in pain") → defers assessment (`isDeferred: true, deferralReason: 'distress_detected'`)
- User declines ("I don't want to do this") → defers (`isDeferred: true, deferralReason: 'user_declined'`)

### Content Rotation (CognitiveHandler)
- Session index 0: word list A, digit set 0, letter F, abstraction set 0, vigilance set 0
- Session index 1: word list B, digit set 1, letter A, abstraction set 1, vigilance set 1
- Session index 5: wraps to word list A (modulo 5), digit set 2 (modulo 3)
- Content selection stored in state for post-call persistence

### Durable Execution
- Each task prompt → interrupt at wait point → resume with user response
- Thread ID: `cognitive:{userId}:{conversationId}`
- State accumulates `taskResponses[]` across turns
- Resuming mid-battery continues from correct task (not restart)

### Task Sequence (9 tasks in order)
1. Orientation → 2. Word Registration → 3. Digit Span Forward → 4. Digit Span Reverse
→ 5. Serial 7s → 6. Letter Vigilance → 7. Letter Fluency → 8. Abstraction → 9. Delayed Recall

- Tasks execute in fixed order (TASK_SEQUENCE)
- `currentTaskIndex` advances after each task completes

### Exit Handling
- Exit keyword mid-task → `isPartial: true`, assessment stops
- Partial results preserved in checkpoint for post-call

### Session Outcomes
- All 9 tasks → `isComplete: true`
- Distress in wellbeing → `isDeferred: true`
- Exit mid-task → `isPartial: true`

## Layer 3: LangSmith
- Trace wellbeing gate and each task node
- Verify task order matches TASK_SEQUENCE
- Inspect validation calls per task

## Test Approach
- Call SupervisorGraph with cognitive session
- Simulate multi-turn for wellbeing (3 turns) + tasks
- Test: full completion, distress deferral, mid-task exit
