# Planning Prompt Template

When asked to plan a feature or task, follow this structure:

0. **Explore first** — before planning, read the relevant 
   files and understand the existing implementation. 
   Check the relevant package CLAUDE.md files, trace 
   the current flow, and identify what already exists 
   that can be reused or extended. Do not plan based 
   on assumptions about what exists.

1. **Restate the objective** — confirm understanding before 
   planning, flag any ambiguity immediately. If anything 
   is unclear, ask before continuing.

2. **Challenge the approach** — before planning implementation, 
   critically evaluate the proposed approach:
   - Is there a simpler way to achieve the same outcome?
   - Does this duplicate something that already exists?
   - Does this introduce unnecessary coupling between packages?
   - Does this conflict with existing patterns in the codebase?
   - Are there edge cases in the proposal that haven't been 
     considered?
   State concerns clearly before proceeding. If a better 
   approach exists, propose it and wait for confirmation 
   before planning around it.

2a. **Wait for challenge response** — if concerns were 
    raised in step 2, wait for explicit confirmation 
    on how to proceed before moving to step 3. Do not 
    assume silence means approval.

3. **Identify affected files and packages** — list every file 
   that will need to change and which package it belongs to.
   Use specific file paths, not vague descriptions:
   - ✅ `packages/llm-server/src/personas/health/HealthCheckGraph.ts`
   - ❌ "the health check graph file"

4. **Flag dependencies** — note any shared package changes 
   that affect multiple services:
   - Any change to shared-* packages requires rebuild of 
     both server and llm-server
   - Any change to shared-core/types/queue-contracts.ts 
     affects both PostCallQueue and PostCallWorker
   - Any change to shared-clients affects all packages 
     that depend on that client

5. **Propose implementation steps** — numbered, ordered by 
   dependency. Each step must be:
   - Atomic — one file or one clear action per step
   - Completable independently before moving to the next
   - Testable — state how to verify this step worked
   
   Format each step as:
   - **What:** specific action and file path
   - **Why:** how it contributes to the objective
   - **Verify:** how to confirm it worked before proceeding

6. **Identify risks** — what could go wrong, what decisions 
   need clarification before starting:
   - Flag anything that touches package boundaries
   - Flag anything that changes existing behavior
   - Flag anything that depends on external services 
     (Twilio, ElevenLabs, Redis, Qdrant)
   - Flag anything that requires a Docker rebuild

7. **Confirm before executing** — do not write any code until 
   the plan is explicitly approved. Present the full plan 
   and wait for a clear "proceed" or "approved" before 
   starting step 1 of the implementation.

## Model
Use Opus with thinking for all planning sessions.
Switch to Sonnet only for execution once the plan 
is approved and the path is clear.

## Format
- Numbered steps, not prose
- Specific file paths in every step
- Call out package boundaries explicitly
- Flag any step that touches shared-* packages — 
  these affect both server and llm-server
- If any step is blocked by an unanswered question, 
  stop and ask rather than making an assumption
- Keep implementation steps atomic — one file change 
  or one clear action per step
- Never proceed past a confirmation gate on assumption