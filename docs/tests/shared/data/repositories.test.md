# Repositories — Test Spec

Reference PRD: [repositories.md](../../prds/shared/data/repositories.md)

All repositories use static methods, Prisma for data access, and follow the pattern: catch → log with prefix → re-throw.

## UserRepository

- `findById()` — returns full profile with includes (conditions, medications, topics, summaries) or null
- `findByPhone()` — returns profile by phone number or null
- `findByEmail()` — returns profile by email or null
- `create()` — creates user with nested relations, returns created profile
- `update()` — updates user fields, returns updated profile

## ConversationRepository

- `createSummary()` — creates conversation summary record
- `findSummaryByConversationId()` — returns summary or null
- `getTopicsByElderlyProfileId()` — returns topics array for a user
- `upsertTopic()` — creates or updates topic, idempotent on topic name
- `createTopicReference()` — creates topic-conversation reference link

## HealthRepository

- `createHealthCheckLog()` — creates health check log with answer data
- `findHealthCheckLogsByElderlyProfileId()` — returns logs for a user
- `findHealthConditionsByElderlyProfileId()` — returns conditions list
- `findMedicationsByElderlyProfileId()` — returns medications list

## CaregiverRepository

- `findById()` — returns caregiver profile or null
- `findByAuthUserId()` — looks up caregiver by auth system user ID
- `findManagedUsers()` — returns elderly users linked to caregiver (with profile includes)
- `create()` — creates caregiver profile

## CaregiverUserLinkRepository

- `findByCaregiverAndUser()` — returns link or null
- `createLink()` — creates caregiver↔elderly link with status
- `removeLink()` — removes link between caregiver and elderly user

## CallLogRepository

- `findByElderlyProfileId()` — returns paginated, filterable call logs
- `findById()` — returns single call log with details
- `getCallStats()` — returns aggregate call statistics for a user

## NotificationRepository

- `create()` — creates notification record
- `findByElderlyProfileId()` — returns notifications for a user
- `markAsRead()` — updates notification status to read
- `getUnreadCount()` — returns count of unread notifications

## CognitiveRepository

- `createTestResult()` — persists cognitive test result
- `findTestResultsByElderlyProfileId()` — returns all results for a user
- `getSessionCount()` — returns total session count for a user
- `getLatestBaseline()` — returns most recent cognitive baseline or null
- `createBaseline()` — creates new cognitive baseline record
- `findSessionsWithCallLog()` — returns sessions joined with call log data
- `findSessionDetailById()` — returns full session detail including task responses
- `findRecentCompletedResults()` — returns recent completed results (for drift detection)

## TrustedContactRepository

- `findByElderlyProfileId()` — returns trusted contacts for a user
- `createSubmission()` — creates IQCODE observation submission
- `getLatestSubmission()` — returns most recent submission or null
- `getSubmissionHistory()` — returns paginated submission history
- `updateConcernIndex()` — updates computed concern index on contact

## Cross-Cutting Tests

### Error handling pattern
- Each repository catches Prisma errors, logs with `[RepositoryName]` prefix, re-throws
- Verify errors propagate to callers (not swallowed)

### Include consistency
- Repositories using `elderlyProfileInclude` (from shared-core) return consistent relation shape
- findById and findByPhone on UserRepository return same structure

### Edge cases
- Queries for non-existent IDs return null (not throw)
- Empty result sets return empty arrays (not null)
- Pagination with offset beyond total returns empty array

## Test Approach
- Integration tests against test PostgreSQL database (not mocks)
- Seed test data before each suite, clean up after
- Verify return shapes match expected Prisma types
- Test pagination parameters (skip, take, filters) where applicable
