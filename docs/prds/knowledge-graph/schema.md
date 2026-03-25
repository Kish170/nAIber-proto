# KG Schema

## Purpose
Defines the Neo4j graph schema — node labels, properties, relationship types, and constraints — used by the knowledge graph population and retrieval services.

## Node Types

| Label | Primary Key | Properties |
|-------|------------|------------|
| `User` | `userId` | `name` |
| `Conversation` | `conversationId` | `date` (YYYY-MM-DD), `durationMinutes`, `callType` ('general'\|'health_check'), `outcome` ('completed') |
| `Summary` | `id` (UUID) | `text`, `createdAt` (ISO8601) |
| `Highlight` | `qdrantPointId` | `id`, `text`, `importanceScore` (default 1.0), `createdAt` (ISO8601) |
| `Topic` | `topicId` | `label`, `variations[]`, `createdAt`, `lastUpdated` |
| `Person` | `id` | `name`, `role?` |

## Relationship Types

| From | Type | To | Properties |
|------|------|----|------------|
| User | `HAS_CONVERSATION` | Conversation | — |
| Conversation | `HAS_SUMMARY` | Summary | `createdAt` |
| Conversation | `HAS_HIGHLIGHT` | Highlight | `createdAt` |
| Summary | `SUMMARIZES` | Highlight | — |
| Summary | `MENTIONS` | Topic | `similarityScore` |
| Highlight | `MENTIONS` | Topic | `similarityScore` |
| User | `MENTIONS` | Topic | `count` (incremental), `firstSeen`, `lastSeen` |
| Topic | `RELATED_TO` | Topic | `strength` (default 1.0), `coOccurrenceCount` (incremental) |
| User | `INTERESTED_IN` | Topic | `strength` (derived: count/10.0) — computed by `deriveInterestedInEdges()` |
| User | `MENTIONED` | Person | `count` (incremental), `context`, `lastSeen` |
| Person | `ASSOCIATED_WITH` | Topic | `count` (incremental), `lastSeen` |

## Write Operations

All writes use Cypher `MERGE` (upsert). Implemented in `GraphRepository.ts`.

## Read Operations

All reads create fresh Neo4j sessions. Implemented in `GraphQueryRepository.ts`.

| Query | Pattern | Limits |
|-------|---------|--------|
| `getHighlightsByTopicIds` | Highlight→MENTIONS→Topic | `importanceScore DESC`, limit 10 |
| `getTopicsForHighlights` | Highlight→MENTIONS→Topic | No limit |
| `getRelatedTopics` | Topic→RELATED_TO→Topic | `strength DESC`, limit 10, min strength 0.1 |
| `getPersonsForTopics` | Person→ASSOCIATED_WITH→Topic | `count DESC`, limit 10 |
| `getHighlightContext` | Multi-OPTIONAL MATCH for topics, summary, conversation, persons | Deduped |

## Infrastructure
- Neo4j Community Edition 5.x
- Database name: `nAIber-KG` (configurable via `NEO4J_DATABASE`)
- No explicit indexes or constraints in code — relies on MERGE keying
- `Neo4jClient.verifyConnectivity()` called at startup

## Current Status
Fully implemented. Schema is implicit (defined by MERGE operations, no migration scripts).

## Related Docs
- [KG Population](./population.md)
- [KG Retrieval](./retrieval.md)
