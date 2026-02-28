# personas/general/

General companionship conversation persona — active listener, friendly companion.

## Communication

- **Invoked by:** SupervisorGraph when `callType` is `'general'`.
- **During call:** ConversationGraph processes each message — classifies intent, retrieves RAG memories, manages topic state, returns response to ElevenLabs.
- **Post-call:** PostCallWorker invokes `GeneralPostCallGraph` which creates conversation summary, extracts/updates topics, generates embeddings for RAG.

## What It Owns

- `ConversationGraph.ts` — Main conversation flow graph. Uses IntentClassifier, MemoryRetriever (RAG), TopicManager for context-aware responses.
- `ConversationState.ts` — LangGraph `Annotation.Root` for general conversation (messages, userId, conversationId, response, etc.).
- `ConversationHandler.ts` — Topic and summary CRUD operations. Exports `createSummary`, `getConversationTopics`, `createConversationTopic`, `updateConversationTopic`, `createConversationReferences`, `ReturnedTopic`.
- `post-call/GeneralPostCallGraph.ts` — Processes completed general conversations: creates summaries, manages topics, updates embeddings.
- `post-call/PostCallState.ts` — State for post-call processing. References `ReturnedTopic` from ConversationHandler.

## What It Does NOT Own

- System prompts (those are in `server/src/prompts/GeneralPrompt.ts`).
- Health data collection or cognitive assessment.

## Dependencies

- `../../services/` (IntentClassifier, MemoryRetriever, TopicManager)
- `@naiber/shared-clients` (OpenAI, VectorStore, ElevenLabs)
- `@naiber/shared-services` (EmbeddingService)
- `@naiber/shared-data` (ConversationRepository)
