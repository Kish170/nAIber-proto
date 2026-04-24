# personas/general/

General companionship conversation persona — active listener, friendly companion.

## Architecture

General calls use a **custom LLM (llm-server) + MCP tool calling** pattern.

- `ConversationGraph` handles live call turns: the LLM decides when to call `retrieveMemories` via OpenAI function calling, llm-server executes the tool against `apps/mcp-server`, and the LLM generates a response with the retrieved context.
- Full user profile is injected into the system prompt by `server` at session start (via `PromptInterface.buildUserContext`). No per-turn profile fetch needed.
- `retrieveMemories` is the only MCP tool called during live turns. `getUserProfile` is available in `McpClient` for other use cases.

## Directory Layout

```
personas/general/
├── ConversationGraph.ts     — LangGraph graph: agent ↔ execute_tools loop
├── ConversationState.ts     — State annotation (messages, userId, conversationId, response)
├── tools/
│   └── McpTools.ts          — MCP tool schemas bound to the LLM (not execution logic)
└── post-call/
    ├── GeneralPostCallGraph.ts   — Summary, topic extraction, embeddings
    └── PostCallState.ts
```

## Tool Calling Pattern

`ConversationGraph` uses OpenAI function calling backed by MCP execution:

1. LLM receives `RETRIEVE_MEMORIES_TOOL` schema via `bindTools()`
2. LLM decides whether to call it based on conversation context
3. If tool_calls present → `executeToolsNode` calls `McpClient.retrieveMemories(query, userId)`
   - `userId` comes from graph state, NOT from LLM args (schema intentionally omits it)
4. Tool result returned as `ToolMessage` → LLM generates final response with context

## Future Enhancement: Dynamic Tool Descriptions

Tool descriptions in `tools/McpTools.ts` are currently static strings. They can be made
dynamic to give the LLM stronger hints about what context is available, for example:

- Interpolate the user's known interests/topics into the `retrieveMemories` description
  so the LLM knows what's worth querying ("user's known topics: gardening, jazz, crosswords")
- Convert `RETRIEVE_MEMORIES_TOOL` to a factory function accepting a `UserProfile` subset

To implement: `ConversationGraph` constructor (or `agentNode`) would accept a user profile
and call the factory. The profile is available in `server` at session start but not currently
passed to llm-server at graph instantiation time — would require either passing it via state
or adding a pre-fetch step in `agentNode`.

## What It Owns

- `ConversationGraph.ts` — Live general call turn handling (LLM + MCP tool loop)
- `ConversationState.ts` — LangGraph state for conversation turns
- `tools/McpTools.ts` — Tool schemas for LLM binding
- `post-call/GeneralPostCallGraph.ts` — Post-call: summary, topic extraction, RAG update
- `post-call/PostCallState.ts` — Post-call state

## What It Does NOT Own

- System prompts (`server/src/prompts/GeneralPrompt.ts`)
- MCP tool execution infrastructure (`clients/McpClient.ts`)
- Health data collection or cognitive assessment

## Dependencies

- `@naiber/shared-clients` (OpenAIClient)
- `clients/McpClient.ts` (llm-server local — calls apps/mcp-server)
- `@langchain/langgraph`, `@langchain/core`