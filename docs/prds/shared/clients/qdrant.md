# Qdrant Client

## Purpose
Vector database access for storing and retrieving conversation memory embeddings.

## Two Clients
- **`QdrantClient`** (`shared-clients`) — direct REST client for Qdrant. Kept for populating the Qdrant cluster with synthetic test data. Not used in production flows.
- **`VectorStoreClient`** (`llm-server/src/clients/`) — LangChain `QdrantVectorStore` wrapper. Primary client used by the RAG pipeline.
  - `searchByEmbedding(userId, vector, limit)` — cosine similarity search filtered by userId
  - `addMemoriesWithIds(entries, metadata)` — upsert conversation highlights with Qdrant point IDs

## Consumers
- llm-server MemoryRetriever (vector search during conversation)
- llm-server GeneralPostCallGraph (storing highlights after call)

## Current Status
Both clients fully implemented. VectorStoreClient is the preferred interface.

## Related Docs
- [RAG Pipeline](../../personas/general/rag-pipeline.md) — retrieval flow using vector search
- [General Post-Call](../../personas/general/post-call.md) — embedding storage after calls
