# @naiber/shared-core
Zero-dependency types package. The foundation layer — every other shared package depends on this.

## What It Owns
- `types/database.ts` — Prisma-derived types (`UserProfileData`, `EmergencyContact`, `HealthCondition`, `Medication`, `ConversationTopic`, `ConversationSummary`, `BasicInfo`) and the `userProfileInclude` validator.
- `types/queue-contracts.ts` — `PostCallJobData` interface and `POST_CALL_QUEUE_NAME` constant. Single source of truth for BullMQ message shapes.

## What It Does NOT Own
- No runtime code, no service logic, no client connections.
- Does not define LangGraph state types — those live in llm-server persona folders.

## Dependencies
- `@prisma/client` (for Prisma type generation only)

## Gotchas
- `database.ts` imports from `../../../../generated/prisma/index.js` — this relative path is sensitive to directory depth. If you move the file, update the path.
- Any new queue or job type should be added to `queue-contracts.ts`, not defined locally in producer/consumer packages.
