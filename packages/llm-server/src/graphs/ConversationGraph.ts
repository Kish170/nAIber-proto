// May need to expand conversation graph to have nodes for health check in portion as well
import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { ConversationState } from "../states/ConversationState.js";
import { VectorStoreClient } from "../../../shared/src/clients/VectorStoreClient.js";

export class ConversationGraph {
    private graph: any;
    private llm: ChatOpenAI;
    private vectorStore: VectorStoreClient;

    constructor(openAIKey: string, vectorStore: VectorStoreClient) {
        this.llm = new ChatOpenAI({
            apiKey: openAIKey,
            model: "gpt-4o",
            temperature: 0.7
        });
        this.vectorStore = vectorStore;

        this.graph = new StateGraph(ConversationState);

        this.graph.addNode("classify_intent", this.classifyIntent.bind(this));
        this.graph.addNode("retrieve_memories", this.retrieveMemories.bind(this));
        this.graph.addNode("check_topic_fatigue", this.checkTopicFatigue.bind(this));
        this.graph.addNode("generate_response", this.generateResponse.bind(this));
        this.graph.addNode("skip_rag", this.skipRAG.bind(this));

        this.graph.addConditionalEdges(
            "classify_intent",
            (state: typeof ConversationState.State) => state.shouldProcessRAG ? "retrieve_memories" : "skip_rag"
        );

        this.graph.addEdge("retrieve_memories", "check_topic_fatigue");
        this.graph.addEdge("check_topic_fatigue", "generate_response");
        this.graph.addEdge("skip_rag", "generate_response");
        this.graph.addEdge("generate_response", END);

        this.graph.setEntryPoint("classify_intent");
    }

    private async classifyIntent(state: typeof ConversationState.State) {
        const lastMessage = state.messages[state.messages.length - 1];
        const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
        const wordCount = content.split(/\s+/).length;

        const shouldProcessRAG = wordCount > 5 &&
                                !this.isFiller(lastMessage.content) &&
                                !this.isBackchannel(lastMessage.content);

        return {
            shouldProcessRAG,
            messageLength: wordCount
        };
    }

    private async retrieveMemories(state: typeof ConversationState.State) {
        const lastMessage = state.messages[state.messages.length - 1];
        const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

        const newEmbedding = await this.vectorStore.embedQuery(content);
        const topicChanged = this.detectTopicChange(
            state.currentTopicVector,
            newEmbedding,
            state.messageLength
        );

        let memories: string[] = [];

        if (topicChanged || state.topicFatigue > 0.25) {
            const docs = await this.vectorStore.searchMemories(
                content,
                state.userId,
                5
            );
            memories = docs.map(doc => doc.pageContent);
        }

        return {
            retrievedMemories: memories,
            currentTopicVector: newEmbedding,
            topicChanged,
            messageCount: topicChanged ? 1 : state.messageCount + 1
        };
    }

    private async checkTopicFatigue(state: typeof ConversationState.State) {
        const messageCount = state.messageCount;
        const baseFatigue = Math.pow(messageCount / 15, 1.8);
        const topicFatigue = Math.min(1.0, baseFatigue);

        let fatigueGuidance = "";
        if (topicFatigue >= 0.75) {
            fatigueGuidance = "TOPIC CHANGE RECOMMENDED: Topic extensively discussed...";
        } else if (topicFatigue >= 0.50) {
            fatigueGuidance = "TOPIC FRESHNESS NEEDED: Topic thoroughly covered...";
        } else if (topicFatigue >= 0.25) {
            fatigueGuidance = "TOPIC ENGAGEMENT NOTE: Watch for user interest cues...";
        }

        return { topicFatigue, fatigueGuidance };
    }

    private async generateResponse(state: typeof ConversationState.State) {
        let contextSection = "";
        if (state.retrievedMemories.length > 0) {
            contextSection = `
# RELEVANT MEMORIES FROM PAST CONVERSATIONS
${state.retrievedMemories.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Use these memories to provide continuity and personalization.
`;
        }

        if (state.fatigueGuidance) {
            contextSection += `\n\n${state.fatigueGuidance}`;
        }

        const prompt = PromptTemplate.fromTemplate(`
{systemPrompt}

{context}

{conversationHistory}
`);

        const chain = prompt.pipe(this.llm);
        const response = await chain.invoke({
            systemPrompt: this.getSystemPrompt(state.userId),
            context: contextSection,
            conversationHistory: this.formatMessages(state.messages)
        });

        return { response: response.content };
    }

    private async skipRAG(state: typeof ConversationState.State) {
        return {
            messageCount: state.messageCount + 1
        };
    }

    private detectTopicChange(
        prevVector: number[] | null,
        newVector: number[],
        messageLength: number
    ): boolean {
        if (!prevVector) return true;

        const similarity = this.cosineSimilarity(prevVector, newVector);

        let threshold = 0.60;
        if (messageLength > 15) threshold = 0.70;
        else if (messageLength > 10) threshold = 0.65;

        return similarity < threshold;
    }

    private isFiller(content: string | any[]): boolean {
        const text = typeof content === 'string' ? content : '';
        const fillerPatterns = [
            /^(ok|okay|sure|yes|no|yep|yeah|nope|alright|got it|thanks|thank you)\.?$/i,
            /^(hmm|umm|uh|ah|oh|well)\.?$/i,
        ];
        return fillerPatterns.some(pattern => pattern.test(text.trim()));
    }

    private isBackchannel(content: string | any[]): boolean {
        const text = typeof content === 'string' ? content : '';
        const backchannelPatterns = [
            /^(uh-huh|mm-hmm|mhm|right|I see|makes sense|interesting)\.?$/i,
        ];
        return backchannelPatterns.some(pattern => pattern.test(text.trim()));
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        if (vecA.length !== vecB.length) {
            throw new Error("Vectors must have the same length");
        }

        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            magnitudeA += vecA[i] * vecA[i];
            magnitudeB += vecB[i] * vecB[i];
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) {
            return 0;
        }

        return dotProduct / (magnitudeA * magnitudeB);
    }

    private getSystemPrompt(userId: string): string {
        return `You are a helpful AI assistant having a conversation with user ${userId}.
Your goal is to provide thoughtful, contextual responses based on the conversation history and any relevant memories from past interactions.`;
    }

    private formatMessages(messages: typeof ConversationState.State['messages']): string {
        return messages.map((msg) => {
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            const role = msg.constructor.name.replace('Message', '').toLowerCase();
            return `${role}: ${content}`;
        }).join('\n');
    }

    public compile() {
        return this.graph.compile();
    }
}