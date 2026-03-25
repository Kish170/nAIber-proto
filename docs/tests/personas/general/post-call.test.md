# General Post-Call — Test Spec

Reference PRD: [post-call.md](../../../prds/personas/general/post-call.md)

## Layer 1: E2E Smoke
- After general call + `!postcall`: ConversationSummary exists in Postgres
- ConversationTopicReference records created
- Neo4j Conversation node exists with correct `conversationId`

## Layer 2: Integration Tests

### fetch_transcript
- Retrieves transcript from ElevenLabs API
- Extracts `callDurationMinutes` from last message's `time_in_call_secs`
- Extracts `callDate` as ISO date string
- Handles empty transcript gracefully (sets error in state)

### generate_summary
- Returns JSON with `summaryText`, `topicsDiscussed`, `keyHighlights`
- Persists ConversationSummary to Postgres with correct `conversationId`
- Returns `summaryId` for downstream nodes

### match_topics
- First call (`isFirstCall: true`): all topics marked as new
- Subsequent call: matches topic to existing when cosine similarity > 0.78
- Does NOT match when similarity ≤ 0.78
- Selects best match when multiple existing topics are candidates
- Outputs separate `topicsToCreate` and `topicsToUpdate` arrays

### update_topics
- Creates new topics in Postgres with generated embeddings
- Updates matched topics: name updated, embedding averaged (old + new)
- Creates ConversationTopicReference entries linking topics to summary

### store_embeddings
- Generates embedding per keyHighlight
- Stores to Qdrant with metadata: `userId`, `conversationId`, `createdAt`, `summaryId`
- Returns `highlightEntries[]` with `qdrantPointId` per entry

### extract_persons
- Extracts person entities via NERService
- Returns `{ id, name, role, context, highlightIndices }`
- Handles transcript with no person mentions (empty array)

### KG population
- See [KG Population test spec](../../knowledge-graph/population.test.md)

### Error accumulation
- If `generate_summary` fails, downstream nodes skip (check `state.errors.length`)
- Errors accumulate — graph doesn't terminate early
- Final state has `completed: false` when errors exist

## Layer 3: LangSmith
- Trace full 8-node graph execution
- Inspect summary generation LLM call (input prompt, JSON output)
- Verify topic matching similarity scores

## Test Approach
- Mock or use real ElevenLabs transcript API
- Invoke GeneralPostCallGraph with known `conversationId` and `userId`
- Verify Postgres (summary, topics, references), Qdrant (highlight embeddings), Neo4j (nodes, relationships)
