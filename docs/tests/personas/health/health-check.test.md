# Health Check — Test Spec
Reference PRD: [health.md](../../../prds/personas/health.md), [health-check.md](../../../prds/personas/health/health-check.md)

## Layer 1: E2E Smoke
- Health check call completes (AI asks questions, accepts answers)
- SupervisorGraph routes to `health_check`
- `durable_execution_active` checkpoint passes
- After post-call: HealthCheckLog exists in Postgres with answers

## Layer 2: Integration Tests

### Question Initialization (HealthCheckHandler)
- Static questions always present: overall feeling (scale), symptoms (text), sleep (scale), anything else (text, optional)
- Dynamic questions generated per health condition (text, condition-specific)
- Dynamic questions generated per medication (boolean, medication)
- Total question count = 4 + active conditions + active medications

### Durable Execution (interrupt/resume)
- **New thread**: graph invokes, returns first question, interrupts at `wait_for_answer`
- **Resume with answer**: `Command({ resume: userAnswer })` → validate → advance → next question → interrupt
- **Completed thread**: `isHealthCheckComplete: true` returned
- Thread ID: `health_check:{userId}:{conversationId}`
- State persists across requests via ShallowRedisSaver

### Answer Validation
- **Scale**: "7" → valid (integer in 1-10). "seven" → LLM extraction → valid. "somewhere around" → invalid
- **Boolean**: "yes" / "yeah" / "y" → normalized to `'yes'`. "sort of" → LLM extraction attempt
- **Text**: any non-empty response → valid. Empty → invalid (unless optional)
- **Text (optional)**: empty/"no" → `'not answered'`, still valid

### Retry Logic
- Invalid answer, attempt 0: LLM tries to extract valid answer from raw response
- Invalid answer, attempt 1+: skip question, record `isValid: false`, `validatedAnswer: 'not answered'`
- Max retries per question: 2 (`MAX_RETRY_ATTEMPTS`)

### Intent Classification on Validation Failure
- `ANSWERING` intent: attempt extraction
- `ASKING` intent: respond to user's clarification, re-ask same question
- `REFUSING` intent: skip question

### Follow-ups
- After valid answer, up to 2 follow-up questions may be generated (`MAX_FOLLOW_UP_QUESTIONS`)
- Follow-ups are contextual to the answer, not from the question bank

### Exit Handling
- Exit keyword detected ("stop", "bye", "i'm done") → skip remaining questions → finalize
- Graph does not force continuation after exit intent

### Question Sequencing
- Questions asked in initialization order
- `currentQuestionIndex` advances only after validation succeeds or retries exhausted
- Clarification does not advance the index

## Layer 3: LangSmith
- Trace each turn: orchestrator → ask_question → wait_for_answer → validate_answer → check_follow_up
- Inspect validation LLM calls (extraction attempts)
- Verify question-answer pairing is correct per turn

## Test Approach
- Call SupervisorGraph directly with health_check session
- Simulate multi-turn: invoke → get question → resume with answer → repeat
- Test all three question types with valid, invalid, and edge-case answers