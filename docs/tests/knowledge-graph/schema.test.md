# KG Schema — Test Spec

Reference PRD: [schema.md](../../prds/knowledge-graph/schema.md)

## Layer 2: Integration Tests

### Node creation via MERGE
- `mergeUser(userId, name)` creates User node with correct properties
- `mergeConversation(...)` creates Conversation with `date`, `durationMinutes`, `callType`, `outcome`
- `mergeHighlight(...)` creates Highlight keyed by `qdrantPointId` (not `id`)
- `mergeTopic(...)` stores `variations[]` as array property
- `mergePerson(...)` stores optional `role` field
- Duplicate MERGE on same key updates properties without creating duplicates

### Relationship creation
- `linkUserToConversation` creates `HAS_CONVERSATION` edge
- `linkConversationToSummary` sets `createdAt` property on edge
- `linkHighlightToTopic` sets `similarityScore` property on edge
- `upsertUserMentionsTopic` increments `count` on repeated calls, preserves `firstSeen`, updates `lastSeen`
- `upsertTopicRelatedToTopic` increments `coOccurrenceCount` on repeated calls
- `upsertPersonAssociatedWithTopic` increments `count` on repeated calls

### Derived edges
- `deriveInterestedInEdges(userId, minCount=3, recencyDays=30)` creates `INTERESTED_IN` only when `count >= 3` and `lastSeen` within 30 days
- `strength` = `count / 10.0`
- Does NOT create edge when count < 3 or lastSeen too old

### Read queries (GraphQueryRepository)
- `getHighlightsByTopicIds` returns results sorted by `importanceScore DESC`, respects limit
- `getRelatedTopics` filters by `strength >= minStrength`, excludes input topics from results
- `getPersonsForTopics` returns results sorted by `count DESC`, respects limit 10
- `getHighlightContext` returns full context (topics, summary, conversation, persons) via OPTIONAL MATCH — missing relationships return null, not error

## Test Approach
- Run against real Neo4j container (test database)
- Seed specific nodes/relationships before each test, clean up after
- Verify node counts and properties via Cypher queries
