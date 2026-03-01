# Architecture Review Prompt Template

When reviewing code for architectural quality:

1. **Check coupling** — does this module import things 
   it shouldn't based on the package dependency rules?
   - server should only import from shared-core, 
     shared-clients, shared-data
   - llm-server can import from all shared packages
   - shared-* packages must not import from server 
     or llm-server

2. **Check cohesion** — does everything in this module 
   belong together? Flag anything that should live 
   in a different package

3. **Check contracts** — are BullMQ job schemas using 
   shared-core/types/queue-contracts.ts? Are API 
   signatures unchanged?

4. **Check persona boundaries** — does any general 
   logic accidentally live inside a persona folder 
   or vice versa?

5. **Produce a prioritized list** — rank issues by 
   impact, distinguish must-fix from nice-to-have

## Model
Use Opus for full architecture reviews.