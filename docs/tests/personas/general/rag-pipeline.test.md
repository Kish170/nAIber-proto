# RAG Pipeline — Test Spec

Reference PRD: [rag-pipeline.md](../../../prds/personas/general/rag-pipeline.md)

## Layer 2: Integration Tests

### Qdrant Search (MemoryRetriever)
- Returns up to 5 results filtered by similarity > 0.45
- Returns empty when no highlights match (similarity below threshold)
- Returns fewer than 5 when only some highlights pass threshold
- Result shape: `{ highlights: string[], documents: MemoryDocument[] }`

### Topic Management (TopicManager)
- **Topic change detection:**
  - New conversation (no prior centroid): returns `topicChanged: true`
  - Message similar to centroid (above threshold): returns `topicChanged: false`
  - Message divergent from centroid (below threshold): returns `topicChanged: true`
  - Dynamic threshold: 0.60 for short messages, 0.70 for messages > 15 words
- **Centroid update:**
  - On topic change: centroid resets to new message vector
  - On continuation: centroid updated via running average
  - Stored in Redis `rag:topic:{conversationId}` with 1h TTL
- **Cache management:**
  - Cache drift > 0.12 (similarity < 0.88 from anchor): triggers cache refresh
  - Cache drift ≤ 0.12: reuses cached highlights

### KG Enrichment
- See [KG Retrieval test spec](../../knowledge-graph/retrieval.test.md) for detailed assertions

### Context Formatting
- Enriched memories format includes: text, topic labels, conversation date, person names with roles
- Related topics section: deduplicated list from all enriched memories
- People section: top 5 by mention count with roles
- Context injected as SystemMessage content (not a separate message)

### End-to-End RAG Flow
- Send substantive message to general call → verify retrieval node executes
- Send backchannel ("ok") → verify retrieval node is skipped
- Send topic-shifting message → verify centroid resets and new memories retrieved

## Layer 3: LangSmith
- Primary observability layer for RAG attribution
- Trace `retrieve_memories` node: inspect Qdrant results, KG enrichment, final `EnrichedMemory[]`
- Verify `source` field on each memory: 'qdrant', 'kg_discovery', or 'both'
- Inspect formatted context string injected into LLM prompt

## Test Approach
- Pre-populate Qdrant with known highlight embeddings for test user
- Pre-populate Neo4j with topics/highlights/persons
- Call ConversationGraph directly or via POST `/v1/chat/completions`
- Assert on state after `retrieve_memories` node (enrichedMemories, personsContext)
