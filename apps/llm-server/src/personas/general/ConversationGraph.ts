import { StateGraph, END } from '@langchain/langgraph';
import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { OpenAIClient } from '@naiber/shared-clients';
import { McpClient } from '../../clients/McpClient.js';
import { ConversationState, ConversationStateType } from './ConversationState.js';
import { RETRIEVE_MEMORIES_TOOL } from './tools/McpTools.js';

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
        const modelWithTools = this.openAIClient.returnChatModel().bindTools([RETRIEVE_MEMORIES_TOOL]);
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