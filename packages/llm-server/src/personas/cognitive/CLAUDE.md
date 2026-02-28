# personas/cognitive/

Cognitive assessment persona — scaffold only, not yet implemented.

## Intended Purpose

Cognitive health assessment through conversational exercises (e.g., memory recall, word association, orientation questions). Will follow the same pattern as health/ and general/ personas.

## Current State

Skeleton files with no implementation:
- `CognitiveGraph.ts` — Placeholder graph, throws "not yet implemented".
- `CognitiveState.ts` — Minimal state annotation (messages, userId, conversationId, response).
- `CognitiveHandler.ts` — Empty handler class.

## When Implementing

- Follow the patterns established in `health/` (question-based flow with validation) and `general/` (conversation graph with state).
- Add a corresponding `CognitivePrompt.ts` in `server/src/prompts/`.
- Add a `'cognitive'` case to SupervisorGraph routing.
- Extend `PostCallJobData.callType` in `shared-core/types/queue-contracts.ts` if post-call processing is needed.
