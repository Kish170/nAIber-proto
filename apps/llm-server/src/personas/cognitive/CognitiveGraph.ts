import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { CognitiveState, CognitiveStateType } from "./CognitiveState.js";
import { CognitiveHandler } from "./CognitiveHandler.js";
import { TASK_SEQUENCE } from "./tasks/TaskDefinitions.js";
import { CognitiveAnswerInterpreter } from "./CognitiveAnswerInterpreter.js";
import { CognitiveDecisionEngine } from "./CognitiveDecisionEngine.js";
import { TaskContextBuilder } from "./TaskContextBuilder.js";
import { OpenAIClient } from "@naiber/shared-clients";

export class CognitiveGraph {
    private llm: ChatOpenAI;
    private compiledGraph: any;
    private readonly answerInterpreter: CognitiveAnswerInterpreter;
    private readonly decisionEngine: CognitiveDecisionEngine;
    private readonly contextBuilder: TaskContextBuilder;

    constructor(openAIClient: OpenAIClient, checkpointer: BaseCheckpointSaver) {
        this.llm = openAIClient.returnChatModel() as any;
        this.answerInterpreter = new CognitiveAnswerInterpreter(this.llm);
        this.decisionEngine = new CognitiveDecisionEngine();
        this.contextBuilder = new TaskContextBuilder();

        const graph: any = new StateGraph(CognitiveState);

        graph.addNode("orchestrator", this.orchestrate.bind(this));
        graph.addNode("present_task", this.presentTask.bind(this));
        graph.addNode("wait_for_input", this.waitForInput.bind(this));
        graph.addNode("interpret_answer", this.interpretAnswer.bind(this));
        graph.addNode("evaluate_and_decide", this.evaluateAndDecide.bind(this));
        graph.addNode("finalize", this.finalize.bind(this));

        graph.setEntryPoint("orchestrator");
        graph.addEdge("orchestrator", "present_task");
        graph.addEdge("present_task", "wait_for_input");
        graph.addEdge("wait_for_input", "interpret_answer");
        graph.addEdge("interpret_answer", "evaluate_and_decide");
        graph.addConditionalEdges("evaluate_and_decide", this.routeFromDecision.bind(this));
        graph.addEdge("finalize", END);

        this.compiledGraph = graph.compile({ checkpointer });
    }

    private async orchestrate(state: CognitiveStateType) {
        if (state.registrationWords?.length > 0) {
            console.log('[Cognitive:init] Already initialized, resuming at taskIndex=%d', state.currentTaskIndex);
            return {};
        }
        const init = await CognitiveHandler.initializeCognitiveTest(state.userId);
        console.log('[Cognitive:init] userId=%s sessionIndex=%d taskCount=%d', state.userId, init.sessionIndex, TASK_SEQUENCE.length);
        return { ...init, tasks: TASK_SEQUENCE, currentTaskIndex: 0 };
    }

    private async presentTask(state: CognitiveStateType) {
        const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
        const task = tasks[state.currentTaskIndex];

        if (!task) {
            console.warn('[Cognitive:present] No task at index', state.currentTaskIndex, '— marking complete');
            return { isComplete: true };
        }

        const prompt = this.contextBuilder.build(state);
        const lastUserMsg = state.messages.length > 0 ? [state.messages[state.messages.length - 1]] : [];
        const response = await this.llm.invoke([new SystemMessage(prompt), ...lastUserMsg]);
        console.log('[Cognitive:present] taskIndex=%d taskType=%s total=%d', state.currentTaskIndex, task.taskType, tasks.length);
        return { response: this.extractContent(response), taskStartTimestamp: Date.now() };
    }

    private waitForInput(state: CognitiveStateType) {
        const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
        const task = tasks[state.currentTaskIndex];
        const userAnswer = interrupt({ taskIndex: state.currentTaskIndex, taskType: task?.taskType, response: state.response });
        return { rawAnswer: String(userAnswer) };
    }

    private async interpretAnswer(state: CognitiveStateType) {
        const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
        const task = tasks[state.currentTaskIndex];
        const interpretation = await this.answerInterpreter.interpret(task, state);
        return { lastInterpretation: interpretation };
    }

    private evaluateAndDecide(state: CognitiveStateType) {
        if (!state.lastInterpretation) {
            console.warn('[Cognitive:decide] lastInterpretation is null — skipping task');
            return {
                currentDecision: { action: 'skip' as const, reasoning: 'No interpretation available' },
                currentTaskIndex: state.currentTaskIndex + 1,
                taskAttempts: 0,
            };
        }
        const { decision, stateUpdates } = this.decisionEngine.evaluate(state, state.lastInterpretation);
        console.log('[Cognitive:decide] action=%s reasoning=%s', decision.action, decision.reasoning);
        return { currentDecision: decision, ...stateUpdates };
    }

    private async finalize(state: CognitiveStateType) {
        let responseText: string;

        if (state.isDeferred) {
            responseText = state.deferralReason === 'distress_detected'
                ? "That's completely okay — let's not do this today. We can reschedule for when you're feeling better. Take care of yourself."
                : "No problem at all. We can do this another time. Take care!";
        } else if (state.isPartial) {
            responseText = "That's alright — we'll pick up from here next time. Thank you for what you've done today. Take care!";
        } else {
            responseText = "And that's it — you're all done. That was really great of you to do this with me. Is there anything you'd like to chat about, or shall we wrap up for today?";
        }

        console.log('[Cognitive:finalize] userId=%s tasksCompleted=%d isDeferred=%s isPartial=%s',
            state.userId, state.taskResponses.length, state.isDeferred, state.isPartial);

        return { response: responseText, isComplete: true };
    }

    private routeFromDecision(state: CognitiveStateType): string {
        let target: string;
        if (state.isComplete || state.isDeferred) target = "finalize";
        else {
            const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
            target = state.currentTaskIndex >= tasks.length ? "finalize" : "present_task";
        }
        console.log('[Cognitive:route] → %s', target);
        return target;
    }

    private extractContent(response: any): string {
        const content = response.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('');
        }
        return String(content);
    }

    get graph() {
        return this.compiledGraph;
    }
}
