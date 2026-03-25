# General Conversation

## Purpose
`ConversationGraph` orchestrates free-form companionship calls. Routes user messages through intent classification, topic management, RAG retrieval, and response generation via a 5-node LangGraph.

## Graph Structure
```
classify_intent → [conditional]
  → shouldProcessRAG: manage_topic_state → retrieve_memories → generate_response → END
  → else: skip_rag → generate_response → END
```

## Nodes

### classify_intent
Uses `IntentClassifier` (compromise NLP) to analyze the user's last message:
- `shouldProcessRAG` = true if message has substantive content (nouns, verbs, questions), is not short (≥5 words), is not filler/affirmative/backchannel
- `isContinuation` = inverse of `shouldProcessRAG`
- `isShortResponse` = word count < 5

Backchannel patterns: `uh-huh, mm-hmm, yeah, yep, ok, right, I see, got it, sure`

### manage_topic_state
- Generates embedding of current message via `EmbeddingService`
- Detects topic change: cosine similarity of current message vs topic centroid < dynamic threshold
  - Threshold: 0.60 (base), 0.65 (10-15 words), 0.70 (>15 words)
- On topic change: reset centroid, clear cached highlights
- On continuation: update centroid via running average, check cache drift (threshold 0.88)

### retrieve_memories
- Qdrant vector search: top 5, filtered by similarity > 0.45
- KG enrichment via `KGRetrievalService`: enrich Qdrant results + discover from graph
- Results cached in Redis (`rag:topic:{conversationId}`, 1h TTL)

### generate_response
- Formats context: enriched memories with topic labels, dates, persons OR plain highlights as fallback
- Injects context into SystemMessage
- Calls `gpt-4o` (temperature 0.7) with last 10 messages + augmented system prompt

### skip_rag
No-op node for short/affirmative responses — bypasses RAG entirely.

## State Channels
Key fields: `messages`, `userId`, `conversationId`, `shouldProcessRAG`, `currentTopicVector`, `enrichedMemories`, `personsContext`, `response`, `isEndCall`

Full state defined in `ConversationState.ts`.

## Dependencies
- IntentClassifier, TopicManager, MemoryRetriever, KGRetrievalService, EmbeddingService
- OpenAI (gpt-4o), Redis, Qdrant, Neo4j

## Current Status
Fully implemented. Note: will be replaced by ElevenLabs native LLM for general calls post-migration (ADR-008).

## Related Docs
- [RAG Pipeline](./rag-pipeline.md)
- [General Post-Call](./post-call.md)
- [ADR-008: General Persona Migration](../../decisions/adr-008-general-persona-migration.md)
