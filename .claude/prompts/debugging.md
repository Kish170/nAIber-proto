# Debugging Prompt Template

When debugging an issue, follow this structure:

1. **Understand before fixing** — read the error, 
   trace the call stack, identify the exact failure point
2. **State what you know** — summarize the error, 
   which file/line, what the expected vs actual behavior is
3. **Check the obvious first** — type errors, import paths 
   (.js extensions in ESM), missing env vars, 
   Docker container not rebuilt after code change
4. **Propose a fix with reasoning** — explain why this 
   fixes the root cause, not just the symptom
5. **Verify after fixing** — run `tsc --noEmit` then 
   `npm run build`, confirm the error is gone

## Common nAIber Gotchas to Check First
- Missing `.js` extension in ESM imports
- Shared package not rebuilt after changes
- Docker container running stale code — needs rebuild not restart
- LangGraph checkpoint version mismatch
- Redis session expired or missing keys
- Wrong package importing from wrong shared sub-package

## Model
Use Opus for complex bugs involving multiple packages.
Use Sonnet for straightforward type errors or 
missing imports.