# General Conversation — Test Spec

Reference PRD: [conversation.md](../../../prds/personas/general/conversation.md)

## Layer 1: E2E Smoke
- General call completes with coherent AI responses
- SupervisorGraph routes to `general_call`
- AI references user context in first message (proves prompt injection works)

## Layer 2: Integration Tests

### Intent Classification (classify_intent)
- Substantive message ("I went gardening with Sarah yesterday") → `shouldProcessRAG: true`
- Short response ("yes") → `shouldProcessRAG: false`, `isShortResponse: true`
- Backchannel ("uh-huh") → `shouldProcessRAG: false`
- Filler + short ("well um") → `shouldProcessRAG: false`
- Affirmative ("ok sure") → `shouldProcessRAG: false`
- Question with nouns ("Do you remember my garden?") → `shouldProcessRAG: true`

### Conditional Routing
- When `shouldProcessRAG: true` → traverses manage_topic_state → retrieve_memories → generate_response
- When `shouldProcessRAG: false` → traverses skip_rag → generate_response (no retrieval)

### Response Generation (generate_response)
- With enriched memories: context section injected into SystemMessage includes topic labels, dates, persons
- With plain highlights (no KG enrichment): fallback format used
- With no memories: generates response without context section
- Uses last 10 messages only (not full history)
- Model: gpt-4o, temperature: 0.7

### Graph Invocation via SupervisorGraph
- POST `/v1/chat/completions` with `user_id` in request → routes to ConversationGraph
- Returns `{ response }` — no completion flags for general calls

## Layer 3: LangSmith
- Trace full graph: classify_intent → manage_topic_state → retrieve_memories → generate_response
- Verify intent classification decision matches expected for message content
- Inspect LLM input to confirm context injection

## Test Approach
- Call llm-server directly via POST `/v1/chat/completions`
- Set up Redis session with `callType: 'general'`
- Send messages of varying complexity to test intent classification paths
