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
import { OpenAIClient, RedisClient } from "@naiber/shared-clients";

export class CognitiveGraph {
    private llm: ChatOpenAI;
    private compiledGraph: any;
    private readonly answerInterpreter: CognitiveAnswerInterpreter;
    private readonly decisionEngine: CognitiveDecisionEngine;
    private readonly contextBuilder: TaskContextBuilder;
    private readonly redisClient: RedisClient;

    constructor(openAIClient: OpenAIClient, checkpointer: BaseCheckpointSaver, redisClient: RedisClient) {
        this.llm = openAIClient.returnChatModel() as any;
        this.answerInterpreter = new CognitiveAnswerInterpreter(this.llm);
        this.decisionEngine = new CognitiveDecisionEngine();
        this.contextBuilder = new TaskContextBuilder();
        this.redisClient = redisClient;

        const graph: any = new StateGraph(CognitiveState);

        graph.addNode("orchestrator", this.orchestrate.bind(this));
        graph.addNode("present_readiness", this.presentReadiness.bind(this));
        graph.addNode("present_task", this.presentTask.bind(this));
        graph.addNode("wait_for_input", this.waitForInput.bind(this));
        graph.addNode("interpret_answer", this.interpretAnswer.bind(this));
        graph.addNode("evaluate_and_decide", this.evaluateAndDecide.bind(this));
        graph.addNode("finalize", this.finalize.bind(this));

        graph.setEntryPoint("orchestrator");
        graph.addConditionalEdges("orchestrator", this.routeFromDecision.bind(this));
        graph.addEdge("present_readiness", "wait_for_input");
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

    private async presentReadiness(state: CognitiveStateType) {
        const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
        const task = tasks[state.currentTaskIndex];

        if (!task) {
            console.warn('[Cognitive:readiness] No task at index', state.currentTaskIndex);
            return { isComplete: true };
        }

        const prompt = this.contextBuilder.buildIntro(state, task);
        const lastUserMsg = state.messages.length > 0 ? [state.messages[state.messages.length - 1]] : [];
        const response = await this.llm.invoke([new SystemMessage(prompt), ...lastUserMsg]);
        console.log('[Cognitive:readiness] taskIndex=%d taskType=%s — presenting readiness check', state.currentTaskIndex, task.taskType);
        return { response: this.extractContent(response), taskStartTimestamp: Date.now() };
    }

    private async presentTask(state: CognitiveStateType) {
        const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
        const task = tasks[state.currentTaskIndex];

        if (!task) {
            console.warn('[Cognitive:present] No task at index', state.currentTaskIndex, '— marking complete');
            return { isComplete: true };
        }

        if (state.currentDecision?.action === 'continue') {
            console.log('[Cognitive:present] taskIndex=%d taskType=%s — silent accumulation (continue)', state.currentTaskIndex, task.taskType);
            return { response: '' };
        }

        const prompt = this.contextBuilder.build(state);
        const lastUserMsg = state.messages.length > 0 ? [state.messages[state.messages.length - 1]] : [];
        const response = await this.llm.invoke([new SystemMessage(prompt), ...lastUserMsg]);
        console.log('[Cognitive:present] taskIndex=%d taskType=%s total=%d', state.currentTaskIndex, task.taskType, tasks.length);
        return { response: this.extractContent(response), taskStartTimestamp: Date.now() };
    }

    private async waitForInput(state: CognitiveStateType) {
        const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
        const task = tasks[state.currentTaskIndex];

        if (state.conversationId) {
            const dtmfKey = `dtmf:${state.conversationId}`;
            const dtmfPending = await this.redisClient.get(dtmfKey);
            if (dtmfPending) {
                await this.redisClient.delete(dtmfKey);
                const finalAnswer = state.accumulatedAnswer || state.rawAnswer;
                console.log('[Cognitive:waitForInput] DTMF signal detected — using accumulated answer (len=%d)', finalAnswer.length);
                return { rawAnswer: finalAnswer, accumulatedAnswer: '', dtmfCompletionSignal: true };
            }
        } else {
            console.warn('[Cognitive:waitForInput] conversationId not set — DTMF lookup skipped');
        }

        const userAnswer = interrupt({ taskIndex: state.currentTaskIndex, taskType: task?.taskType, response: state.response });

        const raw = String(userAnswer);
        const shouldAccumulate = state.currentDecision?.shouldAccumulateAnswer === true;
        const combined = shouldAccumulate && state.accumulatedAnswer
            ? (state.accumulatedAnswer + ' ' + raw).trim()
            : raw;

        return {
            rawAnswer: combined,
            accumulatedAnswer: shouldAccumulate ? combined : '',
            dtmfCompletionSignal: false,
        };
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
            responseText = "And that's it — you've done a wonderful job today. Thank you so much for doing these exercises with me. Take care of yourself, and I'll talk to you again soon. Goodbye!";
        }

        console.log('[Cognitive:finalize] userId=%s tasksCompleted=%d isDeferred=%s isPartial=%s',
            state.userId, state.taskResponses.length, state.isDeferred, state.isPartial);

        return { response: responseText, isComplete: true };
    }

    private routeFromDecision(state: CognitiveStateType): string {
        let target: string;
        if (state.isComplete || state.isDeferred) {
            target = "finalize";
        } else {
            const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
            if (state.currentTaskIndex >= tasks.length) {
                target = "finalize";
            } else {
                const task = tasks[state.currentTaskIndex];
                const needsReadiness = this.contextBuilder.needsReadinessCheck(task.taskType, state);
                target = (needsReadiness && !state.taskReadinessConfirmed)
                    ? "present_readiness"
                    : "present_task";
            }
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
