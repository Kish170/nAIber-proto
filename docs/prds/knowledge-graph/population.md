# KG Population

## Purpose
Creates and updates Neo4j nodes and relationships after a general conversation call. Transforms post-call outputs (summaries, highlights, topics, persons) into a persistent knowledge graph.

## When It Runs
Post-call processing for **general calls only** (not health/cognitive). Invoked by `GeneralPostCallGraph` as the final two nodes: `populate_kg_nodes` → `populate_kg_relationships`.

## Two Phases

### Phase 1: Node Creation (`populateNodes`)
Creates 6 node types from post-call state:
- **User** — from `state.userId`
- **Conversation** — from `state.conversationId`, `callDate`, `callDurationMinutes`, `callType`
- **Summary** — from `state.summaryId`, `state.summary.summaryText`
- **Highlights** — one per `state.highlightEntries[]` (keyed by `qdrantPointId`)
- **Topics** — fetched from Postgres via `getConversationTopics(userId)`
- **Persons** — from `state.extractedPersons[]` (NER output)

### Phase 2: Relationship Creation (`populateRelationships`)
Guards: returns early if `!state.summaryId`.

Creates relationships with key logic:
- **Highlight→Topic MENTIONS**: only created if cosine similarity between highlight embedding and topic embedding ≥ **0.4** (`HIGHLIGHT_TOPIC_SIMILARITY_THRESHOLD`)
- **Topic→Topic RELATED_TO**: all pairwise combinations of discussed topics get bidirectional edges
- **User→Topic MENTIONS**: incremental count with `firstSeen`/`lastSeen` timestamps
- **Person→Topic ASSOCIATED_WITH**: every person × discussed topic combination

## Key Thresholds

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `HIGHLIGHT_TOPIC_SIMILARITY_THRESHOLD` | 0.4 | Min cosine similarity for highlight→topic edge |

## Input (Post-Call State)
- `userId`, `conversationId`, `callDate`, `callDurationMinutes`, `callType`
- `summaryId`, `summary.summaryText`
- `highlightEntries[]` — `{ text, qdrantPointId, embedding }`
- `topicMatchResults[]` — `{ topic, similarity }` from topic matching step
- `extractedPersons[]` — `{ id, name, role, context }` from NER

## Error Handling
Catches and logs errors per operation, re-throws. `try/finally` ensures `repo.close()` runs.

## Current Status
Fully implemented in `KGPopulationService.ts`.

## Related Docs
- [KG Schema](./schema.md)
- [KG Retrieval](./retrieval.md)
- [General Post-Call](../personas/general/post-call.md)
