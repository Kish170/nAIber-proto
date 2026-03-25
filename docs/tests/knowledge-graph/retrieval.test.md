# KG Retrieval — Test Spec

Reference PRD: [retrieval.md](../../prds/knowledge-graph/retrieval.md)

## Layer 2: Integration Tests

### Stream 1: Enrich Qdrant Results
- Given Qdrant documents with known `qdrantPointId`s and matching Neo4j highlights:
  - Returns `topicLabels` from linked Topic nodes
  - Returns `persons` from linked Person nodes
  - Returns `summaryText` and `conversationDate` from context expansion
- Given Qdrant documents with NO matching Neo4j data:
  - Returns enrichedMemories with `kgScore: 0`, `source: 'qdrant'`

### Stream 2: Discover from KG
- Given a user with topics in Postgres and Neo4j highlights linked to those topics:
  - Ranks topics by cosine similarity to message embedding
  - Returns highlights from top-5 topics
  - Returns related topics with `strength >= 0.1`
  - Returns persons associated with top topics
- Given a user with no topics:
  - Returns empty discovery results (no error)

### Merge & Rerank
- Highlight appearing in both streams: marked `source: 'both'`, kgScore gets +0.15 boost (capped at 1.0)
- Final score for Qdrant-sourced: `0.7 * qdrantScore + 0.3 * kgScore`
- Final score for KG-sourced: `0.3 * kgScore` (no Qdrant component)
- Results sorted by `finalScore` descending
- Returns at most 5 results (`finalTopK`)
- KG-discovered highlights get context expansion (topics, persons, dates)

### Two-call validation (KG loop)
- Call 1: general conversation → post-call populates KG nodes
- Call 2: send message related to Call 1 topics → retrieval returns enriched memories from Call 1
- Verify `source` field correctly indicates provenance

### Fallback
- If Neo4j is unreachable: returns empty `KGRetrievalResult` (no crash)
- If no highlights match any topics: returns Qdrant results with no KG enrichment

### Configuration
- `alpha = 0.7` — verify score weighting matches
- `pgTopicLimit = 5` — verify only top 5 topics used
- `kgHighlightLimit = 10` — verify per-topic limit respected
- `relatedTopicMinStrength = 0.1` — verify filtering threshold

## Layer 3: LangSmith
- Trace `retrieve_memories` node in ConversationGraph
- Inspect: which stream contributed each memory, scores, topic labels

## Test Approach
- Pre-populate Neo4j with known graph (users, conversations, highlights, topics, persons, relationships)
- Pre-populate Qdrant with known embeddings
- Call `KGRetrievalService.retrieve()` with crafted message embeddings
- Assert on `EnrichedMemory[]` fields: source, scores, topicLabels, persons
