# RAG Pipeline

## Purpose
Retrieves and ranks past conversation memories to provide continuity in general calls. Combines Qdrant vector search with Neo4j knowledge graph enrichment.

## Pipeline Flow
1. **Intent gate** — IntentClassifier decides if message warrants RAG (substantive content, not backchannel)
2. **Topic state** — TopicManager embeds message, detects topic change, maintains centroid
3. **Qdrant search** — MemoryRetriever queries vector store for similar highlights
4. **KG enrichment** — KGRetrievalService enriches and discovers via Neo4j
5. **Context formatting** — Structured injection into LLM system prompt

## Qdrant Vector Search (MemoryRetriever)
- Query vector: current message embedding (1536-dim, OpenAI)
- Filter: `userId` partition
- Limit: 5 results
- Similarity threshold: **0.45** (`RAG_MEMORY_SIMILARITY_THRESHOLD`, configurable via env)
- Returns: `MemoryDocument[]` with `pageContent`, `metadata`, `score`

## KG Enrichment (KGRetrievalService)
Two parallel streams — see [KG Retrieval PRD](../../knowledge-graph/retrieval.md) for full details.

Output: `EnrichedMemory[]` with source attribution (`'qdrant' | 'kg_discovery' | 'both'`), scores, topic labels, persons.

## Topic Management (TopicManager)
- Maintains running centroid vector in Redis (`rag:topic:{conversationId}`, 1h TTL)
- Topic change detection: cosine similarity < dynamic threshold (0.60-0.70 based on message length)
- On topic change: reset centroid, clear cached highlights
- Cache drift detection: refresh if centroid drifts > 0.12 from cache anchor (threshold 0.88)

## Context Formatting
When enriched memories exist:
```
# RELEVANT MEMORIES FROM PAST CONVERSATIONS
1. {text} [Topics: X, Y] [From: 2026-03-20] [People: Sarah (granddaughter)]
2. ...

# RELATED TOPICS THE USER HAS DISCUSSED
gardening, family visits, ...

# PEOPLE IN THE USER'S LIFE
- Sarah (granddaughter): mentioned 5 times
- ...
```

Fallback (no enrichment): plain list of highlight texts.

Injected as SystemMessage content, prepended to existing system prompt.

## Key Thresholds

| Parameter | Value | Source |
|-----------|-------|--------|
| Qdrant similarity threshold | 0.45 | MemoryRetriever |
| Topic change threshold (base) | 0.60 | IntentClassifier |
| Topic change threshold (>15 words) | 0.70 | IntentClassifier |
| Cache drift threshold | 0.88 | TopicManager |
| KG alpha (Qdrant vs KG weight) | 0.7 | KGRetrievalService |
| Final top-K memories | 5 | KGRetrievalService |
| Max persons displayed | 5 | ConversationGraph |
| Recent message window | 10 | ConversationGraph |

## Current Status
Fully implemented across MemoryRetriever, TopicManager, KGRetrievalService, and ConversationGraph.

## Related Docs
- [General Conversation](./conversation.md)
- [KG Retrieval](../../knowledge-graph/retrieval.md)
- [KG Population](../../knowledge-graph/population.md)
