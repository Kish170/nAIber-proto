# KG Population — Test Spec

Reference PRD: [population.md](../../prds/knowledge-graph/population.md)

## Layer 1: E2E Smoke (via general call)
- After post-call, Conversation node exists in Neo4j for the conversationId
- Summary node exists and links to Conversation via `HAS_SUMMARY`
- At least one Topic node linked via `DISCUSSED` (or `MENTIONS`)

## Layer 2: Integration Tests

### populateNodes
- Creates User node with correct `userId`
- Creates Conversation node with `date`, `durationMinutes`, `callType`
- Creates Summary node with `text` and `createdAt`
- Creates one Highlight node per `highlightEntries[]`, keyed by `qdrantPointId`
- Creates Topic nodes from Postgres topics (fetched via `getConversationTopics`)
- Creates Person nodes from `extractedPersons[]` with `name` and optional `role`
- Skips gracefully when `highlightEntries` is empty (no highlights to create)

### populateRelationships
- Returns early when `summaryId` is null (guard clause)
- Creates `HAS_CONVERSATION` between User and Conversation
- Creates `HAS_SUMMARY` between Conversation and Summary
- Creates `HAS_HIGHLIGHT` for each highlight entry
- Creates `SUMMARIZES` between Summary and each Highlight
- Creates `MENTIONS` between Summary and Topics with `similarityScore` from `topicMatchResults`
- **Highlight→Topic threshold**: only creates `MENTIONS` when cosine similarity ≥ 0.4
- Does NOT create `MENTIONS` for highlight-topic pairs below 0.4 threshold
- Creates pairwise `RELATED_TO` between all discussed topics
- Creates `MENTIONED` between User and each Person with `context`
- Creates `ASSOCIATED_WITH` between each Person and each discussed Topic

### Incremental behavior (second call)
- `MENTIONS` count increments on User→Topic edge
- `coOccurrenceCount` increments on Topic→Topic edge
- `lastSeen` updates on User→Person and Person→Topic edges
- New highlights from second call coexist with first call highlights

### Error handling
- If a single node merge fails, error is logged but other operations continue
- `repo.close()` runs in finally block regardless of errors

## Layer 3: LangSmith
- Trace `populate_kg_nodes` and `populate_kg_relationships` execution in GeneralPostCallGraph

## Test Approach
- Seed a post-call state object with known highlights, topics, persons
- Call `KGPopulationService.populateNodes()` and `populateRelationships()`
- Verify via Cypher queries against test Neo4j
