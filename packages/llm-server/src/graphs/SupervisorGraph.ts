import { BaseMessage, AIMessage, HumanMessage } from "@langchain/core/messages";
import { StateGraph, END, Command } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ConversationGraph } from "../personas/general/ConversationGraph.js";
import { HealthCheckGraph } from "../personas/health/HealthCheckGraph.js";
import { CognitiveGraph } from "../personas/cognitive/CognitiveGraph.js";
import { SupervisorState, SupervisorStateType } from "../states/SupervisorState.js";
import { OpenAIClient, RedisClient } from "@naiber/shared-clients";
import { EmbeddingService } from "@naiber/shared-services";
import { MemoryRetriever } from "../services/MemoryRetriever.js";
import { TopicManager } from "../services/TopicManager.js";
import { KGRetrievalService } from "../services/KGRetrievalService.js";

export class SupervisorGraph {
    private compiledGraph: any;
    private compiledConversationGraph: any;
    private healthCheckGraph: HealthCheckGraph;
    private cognitiveGraph: CognitiveGraph;
    private redisClient: RedisClient;

    constructor(
        openAIClient: OpenAIClient,
        embeddingService: EmbeddingService,
        memoryRetriever: MemoryRetriever,
        topicManager: TopicManager,
        redisClient: RedisClient,
        openAIKey: string,
        checkpointer: BaseCheckpointSaver,
        kgRetrievalService: KGRetrievalService
    ) {
        this.redisClient = redisClient;

        this.compiledConversationGraph = new ConversationGraph(
            openAIKey,
            embeddingService,
            memoryRetriever,
            topicManager,
            kgRetrievalService
        ).compile();

        this.healthCheckGraph = new HealthCheckGraph(openAIClient, checkpointer);
        this.cognitiveGraph = new CognitiveGraph(openAIClient, checkpointer);

        const graph: any = new StateGraph(SupervisorState);

        graph.addNode("supervisor",      this.supervisor.bind(this));
        graph.addNode("general_call",    this.generalCall.bind(this));
        graph.addNode("health_check",    this.healthCheck.bind(this));
        graph.addNode("cognitive_call",  this.cognitiveCall.bind(this));

        graph.setEntryPoint("supervisor");
        graph.addConditionalEdges("supervisor", this.route.bind(this));
        graph.addEdge("general_call", END);
        graph.addEdge("health_check", END);
        graph.addEdge("cognitive_call", END);

        this.compiledGraph = graph.compile();

        console.log("[SupervisorGraph] Initialized");
    }

    get graph() {
        return this.compiledGraph;
    }

    private async supervisor(state: SupervisorStateType) {
        const session = await this.redisClient.getJSON<any>(`session:${state.conversationId}`);
        const callType = session?.callType ?? "general";

        console.log("[SupervisorGraph] Routing to:", callType);

        return { callType };
    }

    private route(state: SupervisorStateType): "general_call" | "health_check" | "cognitive_call" {
        if (state.callType === "health_check") return "health_check";
        if (state.callType === "cognitive") return "cognitive_call";
        return "general_call";
    }

    private async generalCall(state: SupervisorStateType) {
        console.log("[SupervisorGraph] General conversation");

        const result = await this.compiledConversationGraph.invoke({
            messages: state.messages,
            userId: state.userId,
            conversationId: state.conversationId
        });

        console.log("[SupervisorGraph] ConversationGraph completed:", { hasResponse: !!result.response });

        return { response: result.response };
    }

    private async healthCheck(state: SupervisorStateType) {
        const threadId = `health_check:${state.userId}:${state.conversationId}`;
        const config = { configurable: { thread_id: threadId } };

        console.log("[SupervisorGraph] Health check, threadId:", threadId);

        const currentState = await this.healthCheckGraph.graph.getState(config);

        if (!currentState.values || Object.keys(currentState.values).length === 0) {
            console.log("[SupervisorGraph] Starting new health check");

            const result = await this.healthCheckGraph.graph.invoke(
                { messages: state.messages, userId: state.userId, conversationId: state.conversationId },
                config
            );

            return {
                response: result.response,
                isHealthCheckComplete: result.isHealthCheckComplete ?? false
            };
        }

        if (currentState.next && currentState.next.length > 0) {
            console.log("[SupervisorGraph] Resuming health check at:", currentState.next);

            const lastMessage = state.messages[state.messages.length - 1];
            const userAnswer = typeof lastMessage.content === "string"
                ? lastMessage.content
                : JSON.stringify(lastMessage.content);

            const messagesToAdd: BaseMessage[] = [];
            const aiQuestion = currentState.values?.response;
            if (aiQuestion) messagesToAdd.push(new AIMessage(aiQuestion));
            messagesToAdd.push(new HumanMessage(userAnswer));

            const result = await this.healthCheckGraph.graph.invoke(
                new Command({
                    resume: userAnswer,
                    update: {
                        messages: messagesToAdd,
                        userId: state.userId,
                        conversationId: state.conversationId
                    }
                }),
                config
            );

            return {
                response: result.response,
                isHealthCheckComplete: result.isHealthCheckComplete ?? false
            };
        }

        console.log("[SupervisorGraph] Health check already complete");
        return {
            response: "Your health check for this session is complete. Thank you!",
            isHealthCheckComplete: true
        };
    }

    private async cognitiveCall(state: SupervisorStateType) {
        const threadId = `cognitive:${state.userId}:${state.conversationId}`;
        const config = { configurable: { thread_id: threadId } };

        console.log("[SupervisorGraph] Cognitive call, threadId:", threadId);

        const currentState = await this.cognitiveGraph.graph.getState(config);

        if (!currentState.values || Object.keys(currentState.values).length === 0) {
            console.log("[SupervisorGraph] Starting new cognitive assessment");

            const result = await this.cognitiveGraph.graph.invoke(
                { messages: state.messages, userId: state.userId, conversationId: state.conversationId },
                config
            );

            return {
                response: result.response,
                isCognitiveComplete: result.isComplete ?? false
            };
        }

        if (currentState.next && currentState.next.length > 0) {
            console.log("[SupervisorGraph] Resuming cognitive assessment at:", currentState.next);

            const lastMessage = state.messages[state.messages.length - 1];
            const userAnswer = typeof lastMessage.content === "string"
                ? lastMessage.content
                : JSON.stringify(lastMessage.content);

            const messagesToAdd: BaseMessage[] = [];
            const aiQuestion = currentState.values?.response;
            if (aiQuestion) messagesToAdd.push(new AIMessage(aiQuestion));
            messagesToAdd.push(new HumanMessage(userAnswer));

            const result = await this.cognitiveGraph.graph.invoke(
                new Command({
                    resume: userAnswer,
                    update: {
                        messages: messagesToAdd,
                        userId: state.userId,
                        conversationId: state.conversationId
                    }
                }),
                config
            );

            return {
                response: result.response,
                isCognitiveComplete: result.isComplete ?? false
            };
        }

        console.log("[SupervisorGraph] Cognitive assessment already complete");
        return {
            response: "Your mind exercise for this session is complete. Thank you!",
            isCognitiveComplete: true
        };
    }
}
