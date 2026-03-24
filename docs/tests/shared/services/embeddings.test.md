# Embedding Service — Test Spec

Reference PRD: [embeddings.md](../../prds/shared/services/embeddings.md)

## Unit Tests

### EmbeddingService

#### Constructor
- Creates `CacheBackedEmbeddings` with namespace `embeddings:v1`
- Uses provided store or falls back to `InMemoryStore`
- Uses provided `TextPreprocessor` or creates default

#### generateEmbedding()
- Preprocesses text via `TextPreprocessor.getSemanticEssence()` before embedding
- Falls back to original text if preprocessing returns empty string
- Returns `{ embedding, preprocessedText, fromCache }` result

#### generateEmbeddings()
- Preprocesses each text individually
- Falls back to original text per-item when preprocessing returns empty
- Returns array of `EmbeddingResult` matching input order

#### embedQuery()
- Delegates to `CacheBackedEmbeddings.embedQuery()`
- Returns number array

#### embedDocuments()
- Delegates to `CacheBackedEmbeddings.embedDocuments()`
- Returns array of number arrays

### TextPreprocessor

#### cleanText()
- Removes filler words via compromise NLP
- Normalizes whitespace and punctuation
- Preserves case
- Handles unicode normalization

#### extractKeyTerms()
- Extracts nouns, verbs, places, people from text
- Deduplicates terms
- Filters out empty strings
- Returns empty array for text with no substantive terms

#### getSemanticEssence()
- Returns space-joined key terms when terms are found
- Falls back to `cleanText()` when no key terms extracted
- Produces shorter, semantically focused text for embedding

#### hasSubstantiveContent()
- Returns `true` for text containing nouns, verbs, or questions
- Returns `false` for filler-only text (e.g., "um, well, you know")

## High-Impact Error Scenarios

### OpenAI embedding API fails
- Underlying embedding model throws
- Verify error propagates through `CacheBackedEmbeddings` to caller

### Empty or whitespace-only input
- `generateEmbedding("")` or `generateEmbedding("   ")`
- Verify preprocessing handles gracefully, falls back to original text

## Test Approach
- Mock `OpenAIClient.returnEmbeddingModel()` to return mock embeddings
- Use `InMemoryStore` for cache (no Redis dependency in unit tests)
- Test `TextPreprocessor` directly with real compromise NLP (lightweight, no external calls)
- Verify preprocessing-to-embedding pipeline produces consistent results
