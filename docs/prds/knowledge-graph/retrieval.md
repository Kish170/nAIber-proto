# KG Retrieval

## Purpose
Enriches Qdrant vector search results with Neo4j graph context and discovers additional relevant memories via topic traversal. Runs during general conversation calls when RAG is triggered.

## Two Parallel Retrieval Streams

### Stream 1: Enrich Qdrant Results (`enrichQdrantResults`)
For each highlight returned by Qdrant vector search:
1. Fetch linked topics via `getTopicsForHighlights(qdrantPointIds)`
2. Fetch full context via `getHighlightContext(qdrantPointIds)` — topics, summary, conversation metadata, persons

### Stream 2: Discover from KG (`discoverFromKG`)
1. Rank user's topics by cosine similarity to current message embedding
2. Take top-5 topics (`pgTopicLimit`)
3. Run 3 parallel queries:
   - `getHighlightsByTopicIds` — highlights linked to top topics (limit 10)
   - `getRelatedTopics` — topics linked via `RELATED_TO` (min strength 0.1)
   - `getPersonsForTopics` — persons associated with top topics (limit 10)

## Merge, Deduplicate, Rerank

**For Qdrant-sourced highlights:**
- KG score = avg(topicRelevance × similarityScore) for linked topics
- Final score = `alpha × qdrantScore + (1 - alpha) × kgScore`

**For KG-discovered highlights:**
- KG score = `0.6 × topicRelevance + 0.4 × min(1.0, importanceScore / 10)`
- Final score = `(1 - alpha) × kgScore` (no Qdrant component)

**Overlap handling:** If a highlight appears in both streams, add 0.15 to kgScore (capped at 1.0), mark source as `'both'`.

Final: sort by `finalScore` descending, take top-K.

## Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `alpha` | 0.7 | Qdrant vs KG weight (70/30) |
| `pgTopicLimit` | 5 | Max topics to consider from Postgres |
| `kgHighlightLimit` | 10 | Max highlights per topic from KG |
| `relatedTopicMinStrength` | 0.1 | Min strength for related topic edges |
| `finalTopK` | 5 | Max enriched memories returned |

## Output Shape

```
KGRetrievalResult {
  enrichedMemories: EnrichedMemory[]  // top-K ranked
  highlights: string[]                // text only
  personsContext: KGPersonResult[]    // up to 10 persons
}

EnrichedMemory {
  qdrantPointId, text,
  qdrantScore, kgScore, finalScore,
  topicLabels, relatedTopics,
  persons: { name, role }[],
  conversationDate?, summaryText?,
  source: 'qdrant' | 'kg_discovery' | 'both'
}
```

## Fallback
If retrieval fails at any point, returns empty results (no enrichment). Conversation continues with the LLM's base context.

## Current Status
Fully implemented in `KGRetrievalService.ts`.

## Related Docs
- [KG Schema](./schema.md)
- [KG Population](./population.md)
- [RAG Pipeline](../personas/general/rag-pipeline.md)
