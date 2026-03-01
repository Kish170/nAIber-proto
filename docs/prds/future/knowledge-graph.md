# Knowledge Graph Integration

> **Status:** Design — not yet implemented
> **Target DB:** Neo4j
> **Purpose:** Hybrid RAG (vector + graph) for General Conversation persona
> **Last updated:** 2026-03-01

---

## Motivation

The current RAG pipeline retrieves memories from Qdrant via cosine similarity, but returns flat, unstructured results. A Knowledge Graph adds:

- **Structural ranking** — weight memories by topic frequency, recency, and graph centrality
- **Traceability** — explain *why* a memory was retrieved (connected topics, related conversations)
- **Living memory map** — a queryable graph of user interests, people, and conversation history for analytics
- **Improved context selection** — traverse related topics and summaries to enrich retrieved highlights
- **Topic filtering/ranking** — augment Postgres topic matching with graph-based co-occurrence and relevance signals

---

## Hybrid RAG Flow

```
1. Qdrant       → similarity search → returns highlight texts + qdrantPointIds
2. Neo4j        → for each qdrantPointId, traverse:
                     Highlight → Topic
                     Highlight → Summary → Conversation
                     Topic → RELATED_TO → Topic
                   to enrich with structural context
3. Rank          → using graph signals (topic frequency, recency, importanceScore, related topic count)
4. Return        → enriched context to the LLM
```

The most performance-critical KG query starts from Highlight nodes (by `qdrantPointId`), so `Highlight.qdrantPointId` must be indexed in Neo4j.

---

## Schema

### Nodes

#### User
| Property | Type | Source |
|----------|------|--------|
| userId | string | `users.id` (Postgres) |
| name | string | `users.name` |

#### Topic
| Property | Type | Source |
|----------|------|--------|
| topicId | string | `conversation_topics.id` (Postgres) |
| label | string | `conversation_topics.topicName` |
| category | string? | `conversation_topics.category` |
| variations | string[] | `conversation_topics.variations` |
| embeddingId | string | Reference to the topic embedding (Postgres `topicEmbedding` or cached) |
| createdAt | datetime | `conversation_topics.createdAt` |
| lastUpdated | datetime | `conversation_topics.updatedAt` |

#### Highlight
| Property | Type | Source |
|----------|------|--------|
| id | string | KG-generated ID |
| qdrantPointId | string | Qdrant point UUID — the primary cross-reference |
| text | string | `ConversationSummary.keyHighlights[]` / Qdrant `highlight` payload |
| mood | string? | Qdrant `mood` payload |
| importanceScore | float | Computed during post-call (default 1.0) |
| createdAt | datetime | Qdrant `conversationDate` payload |

> **Note:** Highlight identity is owned by Qdrant (the point ID). The post-call pipeline must generate a stable ID shared between Qdrant and the KG.

#### Summary
| Property | Type | Source |
|----------|------|--------|
| id | string | `conversation_summaries.id` (Postgres) |
| text | string | `conversation_summaries.summaryText` |
| createdAt | datetime | `conversation_summaries.createdAt` |

#### Conversation
| Property | Type | Source |
|----------|------|--------|
| conversationId | string | `call_logs.elevenlabsConversationId` |
| startedAt | datetime | `call_logs.scheduledTime` |
| endedAt | datetime? | `call_logs.endTime` |
| callType | string | `'general' \| 'health_check'` (from `PostCallJobData.callType`) |
| outcome | string? | `call_logs.outcome` (COMPLETED, NO_ANSWER, etc.) |

#### Person *(v2 — requires NER pipeline)*
| Property | Type | Source |
|----------|------|--------|
| id | string | KG-generated ID |
| name | string | Extracted via NER from transcript/highlights |
| role | string? | Extracted context (e.g., "daughter", "doctor") |

---

### Relationships

#### v1 — Core (implement first)

| Relationship | Properties | Source |
|---|---|---|
| `(:User)-[:HAS_CONVERSATION]->(:Conversation)` | — | `call_logs.userId` FK |
| `(:Conversation)-[:HAS_SUMMARY]->(:Summary)` | `createdAt` | `call_logs.callLogId → conversation_summaries` (1:1) |
| `(:Conversation)-[:HAS_HIGHLIGHT]->(:Highlight)` | `createdAt` | Qdrant payload `conversationId` |
| `(:Summary)-[:MENTIONS]->(:Topic)` | `similarityScore` | `conversation_topic_references` junction table |
| `(:Highlight)-[:MENTIONS]->(:Topic)` | `similarityScore` | Computed: cosine similarity between highlight embedding and `ConversationTopic.topicEmbedding` |
| `(:Summary)-[:SUMMARIZES]->(:Highlight)` | — | Derived from `ConversationSummary.keyHighlights[]` matching Qdrant points |
| `(:User)-[:MENTIONS]->(:Topic)` | `count`, `lastSeen`, `firstSeen` | Aggregated from `User → ConversationSummary → ConversationTopicReference → ConversationTopic` |
| `(:Topic)-[:RELATED_TO]->(:Topic)` | `strength`, `coOccurrenceCount` | Computed from topic co-occurrence within conversations or embedding similarity |

#### v1.5 — Computed/Derived

| Relationship | Properties | Derivation |
|---|---|---|
| `(:User)-[:INTERESTED_IN]->(:Topic)` | `strength`, `derivedAt`, `count` | Promoted from `MENTIONS` where `count >= threshold` AND `lastSeen` within recency window (e.g., 30 days) |

> `INTERESTED_IN` is not written directly from post-call. It is a computed edge, derived periodically or lazily from `MENTIONS` data.

#### v2 — After NER Pipeline

| Relationship | Properties | Source |
|---|---|---|
| `(:User)-[:MENTIONED]->(:Person)` | `context`, `count`, `lastSeen` | NER extraction from transcript/highlights |
| `(:Person)-[:ASSOCIATED_WITH]->(:Topic)` | `count`, `lastSeen` | Co-occurrence of Person and Topic within same conversation/highlight |

#### Dropped from Original Design

| Relationship | Reason |
|---|---|
| `(:Conversation)-[:MENTIONED]->(:Topic)` | Redundant — always traversable as `Conversation → Summary → Topic`. Every Conversation has exactly one Summary (1:1 via `callLogId`). Maintaining a direct edge creates two write paths for the same semantic with risk of inconsistency. |

---

## Design Decisions

### MENTIONS vs INTERESTED_IN distinction

- **MENTIONS** = raw signal, updated every post-call (`count++`, `lastSeen` updated). This is the **write-path** edge.
- **INTERESTED_IN** = computed edge, derived from MENTIONS based on a threshold (e.g., `count >= 3 AND lastSeen within 30 days`). Not written directly during post-call. Includes `derivedAt` timestamp for staleness tracking.

### Highlight identity

Highlights don't have individual IDs in Postgres — they're stored as a JSON array in `ConversationSummary.keyHighlights`. Identity is owned by Qdrant (the point UUID). During KG population:

1. Iterate `ConversationSummary.keyHighlights[]`
2. Match each highlight text to the corresponding Qdrant point (by `userId` + highlight text)
3. Create Highlight nodes with the Qdrant point ID as `qdrantPointId`
4. Create `SUMMARIZES` edges from Summary to each Highlight

### KG ↔ Qdrant relationship

The KG **references** Qdrant — it does not replace it. Vectors and similarity search stay in Qdrant. The KG adds structural relationships, traversal, and ranking signals. The `qdrantPointId` on Highlight is the bridge.

### Conversation-MENTIONED->Topic removed

Since every Conversation has exactly one Summary (1:1), `Conversation → Summary → Topic` is always a single hop away. The direct edge adds write complexity without meaningful query performance gain for our access patterns.

### coverageScore dropped from SUMMARIZES

Computing "how well a summary covers a highlight" requires embedding similarity between summary text and each highlight — expensive and not needed for the primary query patterns (topic-driven retrieval and conversational context). Can be added later if associative recall (v2) demands it.

---

## Data Source Mapping

| KG Entity/Edge | Postgres | Qdrant | Computed |
|---|---|---|---|
| User | `users` table | — | — |
| Topic | `conversation_topics` table | — | — |
| Highlight | `conversation_summaries.keyHighlights` (text) | Point UUID, embedding, payload | — |
| Summary | `conversation_summaries` table | — | — |
| Conversation | `call_logs` table | — | — |
| Person | — | — | NER extraction (v2) |
| User-MENTIONS->Topic | — | — | Aggregated from `ConversationTopicReference` |
| User-INTERESTED_IN->Topic | — | — | Derived from MENTIONS (threshold + recency) |
| Highlight-MENTIONS->Topic | — | `topics[]` payload (no score) | `similarityScore` computed from embeddings |
| Topic-RELATED_TO->Topic | — | — | Co-occurrence or embedding similarity |

---

## Neo4j Indexes Required

| Index | Type | Purpose |
|---|---|---|
| `Highlight.qdrantPointId` | Unique | Primary lookup for hybrid RAG (Qdrant → KG enrichment) |
| `User.userId` | Unique | User lookups |
| `Topic.topicId` | Unique | Topic lookups |
| `Conversation.conversationId` | Unique | Conversation lookups |
| `Summary.id` | Unique | Summary lookups |
| `Topic.label` | Index | Topic name search |
| `User-MENTIONS->Topic (lastSeen)` | Relationship index | Recency-based topic queries |

---

## Open Questions

- **importanceScore computation:** How should highlight importance be scored? Options: LLM-based scoring during post-call, embedding distinctiveness, or manual heuristic (e.g., length + sentiment).
- **INTERESTED_IN threshold:** What count and recency window defines "interest" vs "mention"? Needs tuning with real data.
- **Topic-RELATED_TO computation:** Co-occurrence within conversations vs embedding similarity vs both? Co-occurrence is cheaper but sparser.
- **NER model selection (v2):** Which NER approach for Person extraction — LLM-based (more accurate, slower) or spaCy/dedicated model (faster, less context-aware)?
- **Backfill strategy:** How to populate the KG from existing Postgres + Qdrant data for users with conversation history.
