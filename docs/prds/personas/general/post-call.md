# General Post-Call Pipeline

## Purpose
Processes a general conversation after call end: fetches transcript, generates summary, matches/creates topics, stores embeddings, extracts persons, and populates the knowledge graph.

## Graph Structure (Sequential)
```
fetch_transcript → generate_summary → match_topics → update_topics
  → store_embeddings → extract_persons → populate_kg_nodes → populate_kg_relationships → END
```

## Nodes

### fetch_transcript
- Calls ElevenLabs API to retrieve structured transcript
- Outputs: `transcript` (JSON string), `callDurationMinutes`, `callDate` (ISO date)

### generate_summary
- Sends formatted transcript to OpenAI with `response_format: { type: 'json_object' }`
- Returns structured JSON: `{ summaryText, topicsDiscussed, keyHighlights }`
- Persists `ConversationSummary` to Postgres, outputs `summaryId`

### match_topics
- Compares generated topics against user's existing topics via cosine similarity
- Match threshold: **0.78** — if similarity > 0.78, marks as matched (best match wins)
- First call: all topics marked as new (`isFirstCall` flag)
- Outputs: `topicsToCreate[]`, `topicsToUpdate[]`, `topicMatchResults[]`

### update_topics
- Creates new topics with embeddings in Postgres
- Updates matched topics: name + averaged embedding (old + new)
- Creates `ConversationTopicReference` entries

### store_embeddings
- Generates embeddings for each `keyHighlight`
- Stores to Qdrant with metadata: `userId`, `conversationId`, `createdAt`, `summaryId`
- Outputs: `highlightEntries[]` with `{ text, embedding, qdrantPointId }`

### extract_persons
- Uses NERService to extract person entities from transcript
- Outputs: `extractedPersons[]` with `{ id, name, role, context, highlightIndices }`

### populate_kg_nodes / populate_kg_relationships
- Calls `KGPopulationService` — see [KG Population PRD](../../knowledge-graph/population.md)

## Error Handling
Each node checks `state.errors.length` at entry — skips if prior errors exist. Errors accumulate in state via concat reducer. No early termination; graph continues to END.

## Key Threshold
- Topic matching similarity: **0.78** (hardcoded in constructor)

## Current Status
Fully implemented in `GeneralPostCallGraph.ts`.

## Related Docs
- [General Conversation](./conversation.md)
- [KG Population](../../knowledge-graph/population.md)
- [Post-Call Worker](../../ai-orchestration/post-call-worker.md)
