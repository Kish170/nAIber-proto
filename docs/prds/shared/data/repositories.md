# Repositories

## Purpose
Pure data access layer over PostgreSQL via Prisma. All database queries go through repositories — no direct Prisma calls in application code.

## Repositories
| Repository | Owns | Key Methods |
|---|---|---|
| `UserRepository` | ElderlyProfile | `findById`, `findByPhone`, `findByEmail`, `create` (with nested relations), `update` |
| `ConversationRepository` | Summaries, Topics | `createSummary`, `findSummaryByConversationId`, `getTopicsByElderlyProfileId`, `upsertTopic`, `createTopicReference` |
| `HealthRepository` | Health data | `createHealthCheckLog`, `findHealthCheckLogsByElderlyProfileId`, `findHealthConditionsByElderlyProfileId`, `findMedicationsByElderlyProfileId` |
| `CaregiverRepository` | CaregiverProfile | `findById`, `findByAuthUserId`, `findManagedUsers`, `create` |
| `CaregiverUserLinkRepository` | Caregiver↔Elderly links | `findByCaregiverAndUser`, `createLink`, `removeLink` |
| `CallLogRepository` | CallLog | `findByElderlyProfileId` (paginated, filterable), `findById`, `getCallStats` |
| `NotificationRepository` | Notifications | `create`, `findByElderlyProfileId`, `markAsRead`, `getUnreadCount` |
| `CognitiveRepository` | Cognitive results + baselines | `createTestResult`, `findTestResultsByElderlyProfileId`, `getSessionCount`, `getLatestBaseline`, `createBaseline`, `findSessionsWithCallLog`, `findSessionDetailById`, `findRecentCompletedResults` |
| `TrustedContactRepository` | Trusted contacts + submissions | `findByElderlyProfileId`, `createSubmission`, `getLatestSubmission`, `getSubmissionHistory`, `updateConcernIndex` |

## Conventions
- Static methods on each class (no instantiation needed)
- Error handling: catch, log with `[RepositoryName]` prefix, re-throw
- Include specs defined in `shared-core` types (e.g. `elderlyProfileInclude`) for consistent relation loading

## Consumers
- Telephony server (UserRepository via UserHandler)
- llm-server (ConversationRepository, HealthRepository, CognitiveRepository)
- Web API (all repositories via tRPC routers)

## Current Status
All repositories fully implemented in `packages/shared-data/src/repositories/`.

## Related Docs
- [Prisma Client](../clients/prisma.md) — database connection
- [Database Schema](../../infrastructure/database-schema.md) — Prisma models these repos query
