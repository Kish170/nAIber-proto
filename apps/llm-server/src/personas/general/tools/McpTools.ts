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

export const GET_USER_BASIC_INFO_TOOL = {
    type: 'function' as const,
    function: {
        name: 'getUserBasicInfo',
        description:
            "Look up the user's basic identity details (name, age, gender, phone). " +
            'Call this if you need to confirm or reference personal details mid-conversation.',
        parameters: { type: 'object', properties: {}, required: [] },
    },
};

export const GET_USER_INTERESTS_TOOL = {
    type: 'function' as const,
    function: {
        name: 'getUserInterests',
        description:
            "Retrieve the user's interests, dislikes, and recent conversation topics. " +
            'Call this when the conversation touches on hobbies, preferences, or things to avoid.',
        parameters: { type: 'object', properties: {}, required: [] },
    },
};

export const GET_USER_MEDICAL_CONTEXT_TOOL = {
    type: 'function' as const,
    function: {
        name: 'getUserMedicalContext',
        description:
            "Fetch the user's active health conditions and medications. " +
            'Call this only when health context is directly relevant to the conversation.',
        parameters: { type: 'object', properties: {}, required: [] },
    },
};

export const GET_USER_PREFERENCES_TOOL = {
    type: 'function' as const,
    function: {
        name: 'getUserPreferences',
        description:
            "Get the user's call preferences — frequency, preferred call time, web access, and whether health check-ins are enabled. " +
            'Call this when scheduling or preference-related topics come up.',
        parameters: { type: 'object', properties: {}, required: [] },
    },
};

export const GET_RELATIONSHIP_CONTEXT_TOOL = {
    type: 'function' as const,
    function: {
        name: 'getRelationshipContext',
        description:
            "Retrieve the user's trusted contacts (family members, close friends, caregivers). " +
            'Call this when the user mentions people in their life or asks about their support network.',
        parameters: { type: 'object', properties: {}, required: [] },
    },
};

export const GET_INTERESTS_TOOL = {
    type: 'function' as const,
    function: {
        name: 'getInterests',
        description:
            "Get a ranked list of topics the user has discussed most frequently across past conversations. " +
            'Call this when you want to steer the conversation toward familiar, engaging subjects.',
        parameters: { type: 'object', properties: {}, required: [] },
    },
};

export const GET_SIGNIFICANT_EVENTS_TOOL = {
    type: 'function' as const,
    function: {
        name: 'getSignificantEvents',
        description:
            "Retrieve highlights from past conversations that were flagged as significant (high importance). " +
            'Call this when the user references a memorable event or milestone from their past.',
        parameters: {
            type: 'object',
            properties: {
                minScore: {
                    type: 'number',
                    description: 'Minimum importance score threshold (1–10). Defaults to 7 if omitted.',
                },
            },
            required: [],
        },
    },
};

export const GET_CONVERSATION_TOPICS_TOOL = {
    type: 'function' as const,
    function: {
        name: 'getConversationTopics',
        description:
            "List all topics the user has discussed across previous conversations. " +
            "Call this for a broad overview of the user's conversation history when planning what to talk about.",
        parameters: { type: 'object', properties: {}, required: [] },
    },
};

export const FLAG_CALL_EVENT_TOOL = {
    type: 'function' as const,
    function: {
        name: 'flagCallEvent',
        description:
            'Flag a concerning event detected during the call — distress, confusion, or an emergency. ' +
            "Use this immediately if the user expresses distress, sounds confused, or mentions an emergency. " +
            "Do not use this for routine conversation.",
        parameters: {
            type: 'object',
            properties: {
                eventType: {
                    type: 'string',
                    enum: ['distress', 'confusion', 'emergency'],
                    description: 'Type of event detected',
                },
                description: {
                    type: 'string',
                    description: 'Brief description of what was observed',
                },
                severity: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Severity level of the event',
                },
            },
            required: ['eventType', 'description'],
        },
    },
};

export const END_CALL_TOOL = {
    type: 'function' as const,
    function: {
        name: 'endCall',
        description:
            'End the current call. Only call this when the user has clearly said goodbye or ' +
            'explicitly indicated they want to finish the conversation. Do not call it preemptively.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
};

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