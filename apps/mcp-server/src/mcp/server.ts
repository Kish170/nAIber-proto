import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUserProfileSchema, getUserProfileHandler } from './tools/getUserProfile.js';
import { retrieveMemoriesSchema, retrieveMemoriesHandler } from './tools/retrieveMemories.js';
import { getUserBasicInfoSchema, getUserBasicInfoHandler } from './tools/getUserBasicInfo.js';
import { getUserInterestsSchema, getUserInterestsHandler } from './tools/getUserInterests.js';
import { getUserMedicalContextSchema, getUserMedicalContextHandler } from './tools/getUserMedicalContext.js';
import { getUserPreferencesSchema, getUserPreferencesHandler } from './tools/getUserPreferences.js';
import { getRelationshipContextSchema, getRelationshipContextHandler } from './tools/getRelationshipContext.js';
import { getInterestsSchema, getInterestsHandler } from './tools/getInterests.js';
import { getSignificantEventsSchema, getSignificantEventsHandler } from './tools/getSignificantEvents.js';
import { getConversationTopicsSchema, getConversationTopicsHandler } from './tools/getConversationTopics.js';
import { flagCallEventSchema, flagCallEventHandler } from './tools/flagCallEvent.js';
import { endCallSchema, endCallHandler } from './tools/endCall.js';

export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: 'naiber-mcp-server',
        version: '1.0.0',
    });

    server.tool(
        'getUserProfile',
        'Fetch the elderly user\'s full profile from the database. Returns name, age, interests, health conditions, medications, and recent conversation topics for LLM context injection.',
        getUserProfileSchema,
        async ({ userId }) => {
            const profile = await getUserProfileHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }],
            };
        }
    );

    server.tool(
        'retrieveMemories',
        'Search the user\'s past conversation memories using semantic vector search and knowledge graph enrichment. Returns relevant highlights, related topics, and mentioned persons.',
        retrieveMemoriesSchema,
        async ({ query, userId }) => {
            const memories = await retrieveMemoriesHandler({ query, userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(memories, null, 2) }],
            };
        }
    );

    server.tool(
        'getUserBasicInfo',
        'Fetch the user\'s basic identity: name, age, phone number, and gender.',
        getUserBasicInfoSchema,
        async ({ userId }) => {
            const info = await getUserBasicInfoHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
            };
        }
    );

    server.tool(
        'getUserInterests',
        'Fetch the user\'s declared interests, dislikes, and recent conversation topics with a brief summary of each.',
        getUserInterestsSchema,
        async ({ userId }) => {
            const interests = await getUserInterestsHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(interests, null, 2) }],
            };
        }
    );

    server.tool(
        'getUserMedicalContext',
        'Fetch the user\'s active health conditions and current medications. Use when health topics arise in conversation.',
        getUserMedicalContextSchema,
        async ({ userId }) => {
            const medical = await getUserMedicalContextHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(medical, null, 2) }],
            };
        }
    );

    server.tool(
        'getUserPreferences',
        'Fetch the user\'s call preferences: call frequency, preferred call time, web access, and communication preferences.',
        getUserPreferencesSchema,
        async ({ userId }) => {
            const prefs = await getUserPreferencesHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(prefs, null, 2) }],
            };
        }
    );

    server.tool(
        'getRelationshipContext',
        'Fetch the user\'s formally registered relationships and trusted contacts from the database. Returns name, relationship type, contact frequency, and reliability tier.',
        getRelationshipContextSchema,
        async ({ userId }) => {
            const relationships = await getRelationshipContextHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(relationships, null, 2) }],
            };
        }
    );

    server.tool(
        'getInterests',
        'Fetch topics the user has discussed most across all conversations, ranked by mention count. Use to understand what subjects the user cares about most.',
        getInterestsSchema,
        async ({ userId }) => {
            const interests = await getInterestsHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(interests, null, 2) }],
            };
        }
    );

    server.tool(
        'getSignificantEvents',
        'Fetch the most significant life events and moments from the user\'s past conversations (importance score 7 or higher). Use when discussing meaningful life moments.',
        getSignificantEventsSchema,
        async ({ userId, minScore }) => {
            const events = await getSignificantEventsHandler({ userId, minScore });
            return {
                content: [{ type: 'text', text: JSON.stringify(events, null, 2) }],
            };
        }
    );

    server.tool(
        'getConversationTopics',
        'Fetch all known conversation topics for the user from the database. Returns topic IDs and names.',
        getConversationTopicsSchema,
        async ({ userId }) => {
            const topics = await getConversationTopicsHandler({ userId });
            return {
                content: [{ type: 'text', text: JSON.stringify(topics, null, 2) }],
            };
        }
    );

    server.tool(
        'flagCallEvent',
        'Persist a distress, confusion, or emergency flag to the database during a call. Use when the user expresses distress, seems confused, or an urgent situation arises.',
        flagCallEventSchema,
        async ({ userId, conversationId, eventType, description, severity }) => {
            const event = await flagCallEventHandler({ userId, conversationId, eventType, description, severity });
            return {
                content: [{ type: 'text', text: JSON.stringify(event, null, 2) }],
            };
        }
    );

    server.tool(
        'endCall',
        'End the current call when the conversation has naturally concluded. Only call when the user has clearly said goodbye or indicated they want to end the call.',
        endCallSchema,
        async ({ conversationId }) => {
            const result = await endCallHandler({ conversationId });
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
    );

    return server;
}
