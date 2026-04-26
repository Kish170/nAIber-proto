import { StateGraph, END } from '@langchain/langgraph';
import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { OpenAIClient } from '@naiber/shared-clients';
import { McpClient } from '../../clients/McpClient.js';
import { ConversationState, ConversationStateType } from './ConversationState.js';
import {
    RETRIEVE_MEMORIES_TOOL,
    END_CALL_TOOL,
    GET_USER_BASIC_INFO_TOOL,
    GET_USER_INTERESTS_TOOL,
    GET_USER_MEDICAL_CONTEXT_TOOL,
    GET_USER_PREFERENCES_TOOL,
    GET_RELATIONSHIP_CONTEXT_TOOL,
    GET_INTERESTS_TOOL,
    GET_SIGNIFICANT_EVENTS_TOOL,
    GET_CONVERSATION_TOPICS_TOOL,
    FLAG_CALL_EVENT_TOOL,
} from './tools/McpTools.js';

export class ConversationGraph {
    private compiledGraph: any;
    private openAIClient: OpenAIClient;
    private mcpClient: McpClient;

    constructor(openAIClient: OpenAIClient, mcpClient: McpClient) {
        this.openAIClient = openAIClient;
        this.mcpClient = mcpClient;

        const graph: any = new StateGraph(ConversationState);

        graph.addNode('agent',         this.agentNode.bind(this));
        graph.addNode('execute_tools', this.executeToolsNode.bind(this));

        graph.setEntryPoint('agent');
        graph.addConditionalEdges('agent', this.shouldContinue.bind(this));
        graph.addEdge('execute_tools', 'agent');

        this.compiledGraph = graph.compile();

        console.log('[ConversationGraph] Initialized');
    }

    get graph() {
        return this.compiledGraph;
    }

    private async agentNode(state: ConversationStateType) {
        const modelWithTools = this.openAIClient.returnChatModel().bindTools([
            RETRIEVE_MEMORIES_TOOL,
            END_CALL_TOOL,
            GET_USER_BASIC_INFO_TOOL,
            GET_USER_INTERESTS_TOOL,
            GET_USER_MEDICAL_CONTEXT_TOOL,
            GET_USER_PREFERENCES_TOOL,
            GET_RELATIONSHIP_CONTEXT_TOOL,
            GET_INTERESTS_TOOL,
            GET_SIGNIFICANT_EVENTS_TOOL,
            GET_CONVERSATION_TOPICS_TOOL,
            FLAG_CALL_EVENT_TOOL,
        ]);
        const aiMessage = await modelWithTools.invoke(state.messages) as AIMessageChunk;

        const toolCalls = (aiMessage as any).tool_calls ?? [];
        console.log('[ConversationGraph] Agent — tool_calls:', toolCalls.length, '| hasContent:', !!aiMessage.content);

        const updates: Partial<ConversationStateType> = { messages: [aiMessage as any] };

        if (toolCalls.length === 0) {
            updates.response = typeof aiMessage.content === 'string'
                ? aiMessage.content
                : JSON.stringify(aiMessage.content);
        }

        return updates;
    }

    private async executeToolsNode(state: ConversationStateType) {
        const lastMessage = state.messages[state.messages.length - 1];
        const toolCalls = (lastMessage as any).tool_calls ?? [];
        const toolMessages: ToolMessage[] = [];

        for (const toolCall of toolCalls) {
            if (toolCall.name === 'retrieveMemories') {
                const query = (toolCall.args as any).query as string;
                console.log(`[ConversationGraph] retrieveMemories — query: "${query.substring(0, 60)}"`);

                try {
                    const memories = await this.mcpClient.retrieveMemories(query, state.userId);
                    console.log(`[ConversationGraph] retrieveMemories — ${memories.highlights?.length ?? 0} highlights`);
                    toolMessages.push(new ToolMessage({
                        content: JSON.stringify(memories),
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                    }));
                } catch (err) {
                    console.error('[ConversationGraph] retrieveMemories failed:', err);

                    toolMessages.push(new ToolMessage({
                        content: JSON.stringify({ highlights: [], relatedTopics: [], persons: [] }),
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                    }));
                }
            } else if (toolCall.name === 'endCall') {
                console.log(`[ConversationGraph] endCall — conversationId: ${state.conversationId}`);

                try {
                    await this.mcpClient.endCall(state.conversationId);
                    toolMessages.push(new ToolMessage({
                        content: JSON.stringify({ scheduled: true }),
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                    }));
                } catch (err) {
                    console.error('[ConversationGraph] endCall failed:', err);
                    toolMessages.push(new ToolMessage({
                        content: JSON.stringify({ scheduled: false, error: 'Failed to schedule call end' }),
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                    }));
                }
            } else if (toolCall.name === 'getUserBasicInfo') {
                try {
                    const data = await this.mcpClient.getUserBasicInfo(state.userId);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] getUserBasicInfo failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ error: 'Could not retrieve basic info' }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            } else if (toolCall.name === 'getUserInterests') {
                try {
                    const data = await this.mcpClient.getUserInterests(state.userId);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] getUserInterests failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ error: 'Could not retrieve interests' }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            } else if (toolCall.name === 'getUserMedicalContext') {
                try {
                    const data = await this.mcpClient.getUserMedicalContext(state.userId);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] getUserMedicalContext failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ error: 'Could not retrieve medical context' }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            } else if (toolCall.name === 'getUserPreferences') {
                try {
                    const data = await this.mcpClient.getUserPreferences(state.userId);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] getUserPreferences failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ error: 'Could not retrieve preferences' }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            } else if (toolCall.name === 'getRelationshipContext') {
                try {
                    const data = await this.mcpClient.getRelationshipContext(state.userId);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] getRelationshipContext failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ contacts: [] }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            } else if (toolCall.name === 'getInterests') {
                try {
                    const data = await this.mcpClient.getInterests(state.userId);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] getInterests failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ topics: [] }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            } else if (toolCall.name === 'getSignificantEvents') {
                const minScore = (toolCall.args as any).minScore as number | undefined;
                try {
                    const data = await this.mcpClient.getSignificantEvents(state.userId, minScore);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] getSignificantEvents failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ events: [] }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            } else if (toolCall.name === 'getConversationTopics') {
                try {
                    const data = await this.mcpClient.getConversationTopics(state.userId);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] getConversationTopics failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ topics: [] }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            } else if (toolCall.name === 'flagCallEvent') {
                const { eventType, description, severity } = toolCall.args as any;
                console.log(`[ConversationGraph] flagCallEvent — type: ${eventType} severity: ${severity ?? 'unset'}`);
                try {
                    const data = await this.mcpClient.flagCallEvent(
                        state.userId,
                        state.conversationId,
                        eventType,
                        description,
                        severity
                    );
                    toolMessages.push(new ToolMessage({ content: JSON.stringify(data), tool_call_id: toolCall.id, name: toolCall.name }));
                } catch (err) {
                    console.error('[ConversationGraph] flagCallEvent failed:', err);
                    toolMessages.push(new ToolMessage({ content: JSON.stringify({ error: 'Could not flag event' }), tool_call_id: toolCall.id, name: toolCall.name }));
                }
            }
        }

        return { messages: toolMessages };
    }

    private shouldContinue(state: ConversationStateType): 'execute_tools' | typeof END {
        const lastMessage = state.messages[state.messages.length - 1];
        const toolCalls = (lastMessage as any).tool_calls ?? [];
        return toolCalls.length > 0 ? 'execute_tools' : END;
    }
}