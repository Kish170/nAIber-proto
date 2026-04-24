/**
 * MCP tool schemas for the general conversation persona.
 *
 * These definitions are passed to the LLM via bindTools() so it can decide
 * when to invoke each tool. Execution is handled in ConversationGraph's
 * executeToolsNode — the LLM never calls these directly.
 *
 * Note on userId: userId is intentionally excluded from all tool schemas here.
 * The graph captures userId from state at execution time. The LLM only needs
 * to supply the query — it should never need to extract or pass the userId itself.
 *
 * --- Future enhancement: dynamic tool descriptions ---
 * Tool descriptions can be made dynamic at graph instantiation (or per-turn) to
 * give the LLM stronger hints about what context is available. Examples:
 *
 *   retrieveMemories:
 *     - "The user's known interests include: gardening, jazz, crosswords. Search
 *       memories related to these when conversation touches on them."
 *     - Include recent topic names so the LLM knows what's worth querying.
 *
 * To implement: convert these to factory functions that accept a UserProfile
 * (or subset) and return the schema with an interpolated description string.
 * See: apps/llm-server/src/personas/general/CLAUDE.md
 */

export const RETRIEVE_MEMORIES_TOOL = {
    type: 'function' as const,
    function: {
        name: 'retrieveMemories',
        description:
            "Search the user's past conversation memories for relevant context. " +
            'Call this when the user references a person, a past event, a hobby, a place, ' +
            'or any topic that may have come up in previous conversations.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The conversation topic or context to search memories for',
                },
            },
            required: ['query'],
        },
    },
};