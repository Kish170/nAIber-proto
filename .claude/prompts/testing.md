# Testing Prompt Template

When writing tests or verifying a feature:

1. **Identify what needs testing** — the specific 
   behavior, not the implementation
2. **Check existing test patterns** — follow whatever 
   testing approach already exists in this package
3. **Write the test before verifying it works** — 
   don't assume, run it
4. **Cover the unhappy path** — what happens when 
   inputs are invalid, services are unavailable, 
   or state is missing
5. **Verify with build** — `tsc --noEmit` then 
   `npm run build` after adding any test files

## nAIber Specific
- For WebSocket behavior — use Docker logs as 
  verification, not unit tests
- For LangGraph graphs — trace state transitions 
  through logs
- For BullMQ jobs — verify via Bull Board at 
  /admin/queues
- For API endpoints — use curl commands in 
  .claude/commands/test-api.md