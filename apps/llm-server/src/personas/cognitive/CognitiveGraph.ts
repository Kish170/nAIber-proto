import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { CognitiveState, CognitiveStateType } from "./CognitiveState.js";
import { CognitiveHandler } from "./CognitiveHandler.js";
import { CognitiveTaskType, TASK_SEQUENCE, WELLBEING_QUESTIONS } from "./tasks/TaskDefinitions.js";
import type { TaskResponse, RetrievalLevel, WellbeingResponse } from "./tasks/TaskDefinitions.js";
import {
    getWordList,
    getDigitSet,
    getLetter,
    getAbstractionSet,
    getVigilanceSet,
} from "./tasks/ContentRotation.js";
import {
    validateOrientation,
    validateWordRegistration,
    validateDigitSpan,
    validateSerial7s,
    validateWorldBackward,
    validateLetterVigilance,
    validateLetterFluency,
    validateAbstraction,
    validateFreeRecall,
    validateCuedRecall,
    validateRecognition,
} from "./tasks/TaskValidation.js";
import { OpenAIClient } from "@naiber/shared-clients";

// this is something that should be assessed by an LLM we will soon creat an MCP server with tools for the LLM to better deal with this
const EXIT_KEYWORDS = ['i have to go', 'i need to go', 'stop', 'end', 'quit', "i'm done", 'i am done', 'goodbye', 'bye'];
const DISTRESS_KEYWORDS = ['pain', 'unwell', 'sick', 'terrible', 'awful', 'can\'t do this', 'very tired', 'exhausted', 'hurting'];

export class CognitiveGraph {
    private llm: ChatOpenAI;
    private compiledGraph: any;

    constructor(openAIClient: OpenAIClient, checkpointer: BaseCheckpointSaver) {
        this.llm = openAIClient.returnChatModel() as any;

        const graph: any = new StateGraph(CognitiveState);

        graph.addNode("orchestrator", this.orchestrate.bind(this));
        graph.addNode("wellbeing_prompt", this.wellbeingPrompt.bind(this));
        graph.addNode("wellbeing_wait", this.wellbeingWait.bind(this));
        graph.addNode("wellbeing_evaluate", this.wellbeingEvaluate.bind(this));
        graph.addNode("prompt_task", this.promptTask.bind(this));
        graph.addNode("wait_for_response", this.waitForResponse.bind(this));
        graph.addNode("evaluate_response", this.evaluateResponse.bind(this));
        graph.addNode("route_next", this.routeNext.bind(this));
        graph.addNode("finalize", this.finalize.bind(this));

        graph.setEntryPoint("orchestrator");
        graph.addEdge("orchestrator", "wellbeing_prompt");
        graph.addEdge("wellbeing_prompt", "wellbeing_wait");
        graph.addEdge("wellbeing_wait", "wellbeing_evaluate");
        graph.addConditionalEdges("wellbeing_evaluate", this.routeAfterWellbeing.bind(this));
        graph.addEdge("prompt_task", "wait_for_response");
        graph.addEdge("wait_for_response", "evaluate_response");
        graph.addEdge("evaluate_response", "route_next");
        graph.addConditionalEdges("route_next", this.routeAfterTask.bind(this));
        graph.addEdge("finalize", END);

        this.compiledGraph = graph.compile({ checkpointer });
    }

    private async orchestrate(state: CognitiveStateType) {
        if (state.registrationWords?.length > 0) {
            console.log('[CognitiveGraph] Already initialized, skipping');
            return {};
        }

        console.log('[CognitiveGraph] Initializing for userId:', state.userId);

        const init = await CognitiveHandler.initializeCognitiveTest(state.userId);

        return {
            sessionIndex: init.sessionIndex,
            selectedWordList: init.selectedWordList,
            registrationWords: init.registrationWords,
            selectedDigitSet: init.selectedDigitSet,
            selectedLetter: init.selectedLetter,
            selectedAbstractionSet: init.selectedAbstractionSet,
            selectedVigilanceSet: init.selectedVigilanceSet,
            currentPhase: 'wellbeing',
            wellbeingQuestionIndex: 0,
        };
    }

    private async wellbeingPrompt(state: CognitiveStateType) {
        const questionIndex = state.wellbeingQuestionIndex;
        const question = WELLBEING_QUESTIONS[questionIndex];

        const isFirst = questionIndex === 0;
        const systemPrompt = isFirst
            ? `You are nAIber, a warm AI companion conducting a brief wellness check before a mind exercise.\n` +
              `Ask the following question warmly and conversationally. This is the opening check-in.\n` +
              `Question: "${question}"\n` +
              `Keep it brief and natural — one or two sentences.`
            : `You are nAIber. Continue the pre-exercise check-in warmly.\n` +
              `Ask: "${question}"\n` +
              `Keep it brief — acknowledge their previous answer naturally before asking.`;

        const messages = [new SystemMessage(systemPrompt), ...state.messages.slice(-4)];
        const response = await this.llm.invoke(messages);
        const content = this.extractContent(response);

        console.log('[CognitiveGraph] Wellbeing question:', { questionIndex, total: WELLBEING_QUESTIONS.length });

        return { response: content };
    }

    private wellbeingWait(state: CognitiveStateType) {
        const userAnswer = interrupt({
            phase: 'wellbeing',
            questionIndex: state.wellbeingQuestionIndex,
            response: state.response,
        });

        return { rawAnswer: String(userAnswer) };
    }

    private async wellbeingEvaluate(state: CognitiveStateType) {
        const rawAnswer = state.rawAnswer;

        if (this.isExitIntent(rawAnswer)) {
            console.log('[CognitiveGraph] Exit intent during wellbeing');
            return {
                isDeferred: true,
                deferralReason: 'user_declined',
                currentPhase: 'deferred',
            };
        }

        const distress = this.detectDistress(rawAnswer);

        const wellbeingResponse: WellbeingResponse = {
            questionIndex: state.wellbeingQuestionIndex,
            question: WELLBEING_QUESTIONS[state.wellbeingQuestionIndex],
            rawAnswer,
            distressDetected: distress,
        };

        const updatedResponses = [...state.wellbeingResponses, wellbeingResponse];

        if (distress) {
            console.log('[CognitiveGraph] Distress detected during wellbeing');
            return {
                wellbeingResponses: updatedResponses,
                distressDetected: true,
                isDeferred: true,
                deferralReason: 'distress_detected',
                currentPhase: 'deferred',
            };
        }

        const nextIndex = state.wellbeingQuestionIndex + 1;

        if (nextIndex >= WELLBEING_QUESTIONS.length) {
            console.log('[CognitiveGraph] Wellbeing check complete, starting tasks');
            return {
                wellbeingResponses: updatedResponses,
                wellbeingQuestionIndex: nextIndex,
                currentPhase: 'tasks',
                currentTaskIndex: 0,
            };
        }

        return {
            wellbeingResponses: updatedResponses,
            wellbeingQuestionIndex: nextIndex,
        };
    }

    private routeAfterWellbeing(state: CognitiveStateType): string {
        if (state.currentPhase === 'deferred') return "finalize";
        if (state.currentPhase === 'tasks') return "prompt_task";
        return "wellbeing_prompt";
    }

    private async promptTask(state: CognitiveStateType) {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];

        if (!taskDef) {
            console.error('[CognitiveGraph] No task at index:', state.currentTaskIndex);
            return { isComplete: true, currentPhase: 'complete' };
        }

        const promptText = this.buildTaskPrompt(state, taskDef.taskType);

        const messages = [new SystemMessage(promptText), ...state.messages.slice(-4)];
        const response = await this.llm.invoke(messages);
        const content = this.extractContent(response);

        console.log('[CognitiveGraph] Task prompt:', {
            taskIndex: state.currentTaskIndex,
            taskType: taskDef.taskType,
            total: TASK_SEQUENCE.length,
        });

        return {
            response: content,
            taskStartTimestamp: Date.now(),
        };
    }

    private waitForResponse(state: CognitiveStateType) {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];

        const userAnswer = interrupt({
            phase: 'task',
            taskIndex: state.currentTaskIndex,
            taskType: taskDef?.taskType,
            response: state.response,
        });

        return { rawAnswer: String(userAnswer) };
    }

    private async evaluateResponse(state: CognitiveStateType) {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];
        const rawAnswer = state.rawAnswer;

        if (this.isExitIntent(rawAnswer)) {
            console.log('[CognitiveGraph] Exit intent during task');
            return { isComplete: true, isPartial: true, currentPhase: 'complete' };
        }

        const latencyMs = state.taskStartTimestamp > 0 ? Date.now() - state.taskStartTimestamp : undefined;

        switch (taskDef.taskType) {
            case CognitiveTaskType.ORIENTATION:
                return this.evaluateOrientation(state, rawAnswer, latencyMs);

            case CognitiveTaskType.WORD_REGISTRATION:
                return this.evaluateWordRegistration(state, rawAnswer, latencyMs);

            case CognitiveTaskType.DIGIT_SPAN_FORWARD:
                return this.evaluateDigitSpanForward(state, rawAnswer, latencyMs);

            case CognitiveTaskType.DIGIT_SPAN_REVERSE:
                return this.evaluateDigitSpanReverse(state, rawAnswer, latencyMs);

            case CognitiveTaskType.SERIAL_7S:
                return this.evaluateSerial7s(state, rawAnswer, latencyMs);

            case CognitiveTaskType.LETTER_VIGILANCE:
                return this.evaluateLetterVigilance(state, rawAnswer, latencyMs);

            case CognitiveTaskType.LETTER_FLUENCY:
                return this.evaluateLetterFluency(state, rawAnswer, latencyMs);

            case CognitiveTaskType.ABSTRACTION:
                return this.evaluateAbstraction(state, rawAnswer, latencyMs);

            case CognitiveTaskType.DELAYED_RECALL:
                return this.evaluateDelayedRecall(state, rawAnswer, latencyMs);

            default:
                console.error('[CognitiveGraph] Unknown task type:', taskDef.taskType);
                return {};
        }
    }

    private evaluateOrientation(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        const result = validateOrientation(rawAnswer, new Date());
        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.ORIENTATION,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer,
            rawScore: result.score,
            maxScore: result.maxScore,
            latencyMs,
        };

        return { taskResponses: [...state.taskResponses, taskResponse] };
    }

    private evaluateWordRegistration(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        const result = validateWordRegistration(rawAnswer, state.registrationWords);

        if (!result.registrationComplete && state.registrationAttempts < 1) {
            return {
                registrationAttempts: state.registrationAttempts + 1,
                registrationComplete: false,
            };
        }

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.WORD_REGISTRATION,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer,
            rawScore: 0, // not scored
            maxScore: null,
            latencyMs,
            registrationQuality: result.registrationQuality,
        };

        return {
            taskResponses: [...state.taskResponses, taskResponse],
            registrationComplete: result.registrationComplete,
            registrationQuality: result.registrationQuality,
            registrationAttempts: 0,
        };
    }

    private evaluateDigitSpanForward(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        const digitSet = getDigitSet(state.selectedDigitSet);
        const length = state.digitSpanCurrentLength;
        const trial = state.digitSpanCurrentTrial as 'A' | 'B';

        const lengthData = digitSet.forward[length];
        if (!lengthData) {
            return this.recordDigitSpanForwardResult(state, latencyMs);
        }

        const targetSequence = trial === 'A' ? lengthData.trialA : lengthData.trialB;
        const correct = validateDigitSpan(rawAnswer, targetSequence, false);

        if (correct) {
            const newLongest = Math.max(state.digitSpanLongestForward, length);

            const nextLength = length + 1;
            if (digitSet.forward[nextLength]) {
                return {
                    digitSpanLongestForward: newLongest,
                    digitSpanCurrentLength: nextLength,
                    digitSpanCurrentTrial: 'A',
                    digitSpanConsecutiveFailures: 0,
                };
            }
            return this.recordDigitSpanForwardResult({ ...state, digitSpanLongestForward: newLongest } as CognitiveStateType, latencyMs);
        }

        if (trial === 'A') {
            return { digitSpanCurrentTrial: 'B' };
        }

        return this.recordDigitSpanForwardResult(state, latencyMs);
    }

    private recordDigitSpanForwardResult(state: CognitiveStateType, latencyMs?: number) {
        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.DIGIT_SPAN_FORWARD,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer: state.rawAnswer,
            rawScore: state.digitSpanLongestForward,
            maxScore: 5,
            latencyMs,
        };

        return {
            taskResponses: [...state.taskResponses, taskResponse],
            digitSpanCurrentLength: 3,
            digitSpanCurrentTrial: 'A',
            digitSpanConsecutiveFailures: 0,
        };
    }

    private evaluateDigitSpanReverse(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        const digitSet = getDigitSet(state.selectedDigitSet);
        const length = state.digitSpanCurrentLength;
        const trial = state.digitSpanCurrentTrial as 'A' | 'B';

        const lengthData = digitSet.reverse[length];
        if (!lengthData) {
            return this.recordDigitSpanReverseResult(state, latencyMs);
        }

        const targetSequence = trial === 'A' ? lengthData.trialA : lengthData.trialB;
        const correct = validateDigitSpan(rawAnswer, targetSequence, true);

        if (correct) {
            const newLongest = Math.max(state.digitSpanLongestReverse, length);
            const nextLength = length + 1;

            if (digitSet.reverse[nextLength]) {
                return {
                    digitSpanLongestReverse: newLongest,
                    digitSpanCurrentLength: nextLength,
                    digitSpanCurrentTrial: 'A',
                    digitSpanConsecutiveFailures: 0,
                };
            }
            return this.recordDigitSpanReverseResult({ ...state, digitSpanLongestReverse: newLongest } as CognitiveStateType, latencyMs);
        }

        if (trial === 'A') {
            return { digitSpanCurrentTrial: 'B' };
        }

        return this.recordDigitSpanReverseResult(state, latencyMs);
    }

    private recordDigitSpanReverseResult(state: CognitiveStateType, latencyMs?: number) {
        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.DIGIT_SPAN_REVERSE,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer: state.rawAnswer,
            rawScore: state.digitSpanLongestReverse,
            maxScore: 4,
            latencyMs,
        };

        return {
            taskResponses: [...state.taskResponses, taskResponse],
            digitSpanCurrentLength: 3,
            digitSpanCurrentTrial: 'A',
            digitSpanConsecutiveFailures: 0,
        };
    }

    private evaluateSerial7s(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        // Check if user indicated they can't do arithmetic should be an llm task
        const cantDoMath = /can'?t|cannot|don'?t know|no good|not good|unable/i.test(rawAnswer) &&
                           /math|number|subtract|count/i.test(rawAnswer);

        if (cantDoMath && !state.usedWorldAlternative) {
            return { usedWorldAlternative: true };
        }

        let score: number;
        let usedAlternative = state.usedWorldAlternative;

        if (usedAlternative) {
            const result = validateWorldBackward(rawAnswer);
            score = result.score;
        } else {
            const result = validateSerial7s(rawAnswer);
            score = result.score;
        }

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.SERIAL_7S,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer,
            rawScore: score,
            maxScore: 5,
            latencyMs,
            usedAlternative,
        };

        return { taskResponses: [...state.taskResponses, taskResponse] };
    }

    private evaluateLetterVigilance(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        const vigilanceSet = getVigilanceSet(state.selectedVigilanceSet);

        const numberMatch = rawAnswer.match(/\d+/);
        const confirmedCount = numberMatch ? parseInt(numberMatch[0], 10) : null;

        const result = validateLetterVigilance([], confirmedCount, vigilanceSet);

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.LETTER_VIGILANCE,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer,
            rawScore: result.score,
            maxScore: result.maxScore,
            latencyMs,
        };

        return { taskResponses: [...state.taskResponses, taskResponse] };
    }

    private evaluateLetterFluency(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        const result = validateLetterFluency(rawAnswer, state.selectedLetter);

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.LETTER_FLUENCY,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer,
            rawScore: result.score,
            maxScore: null,
            latencyMs,
            perseverationSignals: result.perseverationSignals,
        };

        return { taskResponses: [...state.taskResponses, taskResponse] };
    }

    private async evaluateAbstraction(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        const abstractionSet = getAbstractionSet(state.selectedAbstractionSet);

        const pairIndex = state.taskAttempts;
        const pair = abstractionSet.pairs[pairIndex];

        if (!pair) {
            return {};
        }

        const result = await validateAbstraction(rawAnswer, pair, this.llm);

        if (pairIndex === 0) {
            return {
                taskAttempts: 1,
                taskResponses: [...state.taskResponses, {
                    taskType: CognitiveTaskType.ABSTRACTION,
                    domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
                    rawAnswer,
                    rawScore: result.score,
                    maxScore: 2,
                    latencyMs,
                } as TaskResponse],
            };
        }

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.ABSTRACTION,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer,
            rawScore: result.score,
            maxScore: 2,
            latencyMs,
        };

        return {
            taskResponses: [...state.taskResponses, taskResponse],
            taskAttempts: 0,
        };
    }

    private evaluateDelayedRecall(state: CognitiveStateType, rawAnswer: string, latencyMs?: number) {
        const targetWords = state.registrationWords;

        if (state.delayedRecallPhase === 'free') {
            const result = validateFreeRecall(rawAnswer, targetWords);

            const retrievalLevels: RetrievalLevel[] = result.recalled.map(word => ({
                word,
                level: 'free' as const,
                score: 2,
            }));

            const missedWords = result.missed;

            if (missedWords.length === 0) {
                const taskResponse: TaskResponse = {
                    taskType: CognitiveTaskType.DELAYED_RECALL,
                    domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
                    rawAnswer,
                    rawScore: retrievalLevels.reduce((s, r) => s + r.score, 0),
                    maxScore: 10,
                    latencyMs,
                    retrievalLevels,
                    intrusionErrors: result.intrusions,
                };
                return {
                    taskResponses: [...state.taskResponses, taskResponse],
                    delayedRecallResults: retrievalLevels,
                    delayedRecallPhase: 'free',
                };
            }

            return {
                delayedRecallResults: retrievalLevels,
                delayedRecallMissedWords: missedWords,
                delayedRecallPhase: 'cued',
                delayedRecallWordIndex: 0,
            };
        }

        if (state.delayedRecallPhase === 'cued') {
            const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];
            const recalled = validateCuedRecall(rawAnswer, currentWord);

            let updatedResults = [...state.delayedRecallResults];
            let remainingMissed = [...state.delayedRecallMissedWords];

            if (recalled) {
                updatedResults.push({ word: currentWord, level: 'cued', score: 1 });
                remainingMissed = remainingMissed.filter(w => w !== currentWord);
            }

            const nextWordIndex = state.delayedRecallWordIndex + 1;

            if (nextWordIndex >= state.delayedRecallMissedWords.length) {
                const stillMissed = state.delayedRecallMissedWords.filter(
                    w => !updatedResults.some(r => r.word === w)
                );

                if (stillMissed.length === 0) {
                    return this.recordDelayedRecallResult(state, updatedResults, rawAnswer, latencyMs);
                }

                return {
                    delayedRecallResults: updatedResults,
                    delayedRecallMissedWords: stillMissed,
                    delayedRecallPhase: 'recognition',
                    delayedRecallWordIndex: 0,
                };
            }

            return {
                delayedRecallResults: updatedResults,
                delayedRecallWordIndex: nextWordIndex,
            };
        }

        if (state.delayedRecallPhase === 'recognition') {
            const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];
            const recalled = validateRecognition(rawAnswer, currentWord);

            let updatedResults = [...state.delayedRecallResults];

            if (recalled) {
                updatedResults.push({ word: currentWord, level: 'recognition', score: 0 });
            } else {
                updatedResults.push({ word: currentWord, level: 'not_recalled', score: 0 });
            }

            const nextWordIndex = state.delayedRecallWordIndex + 1;

            if (nextWordIndex >= state.delayedRecallMissedWords.length) {
                return this.recordDelayedRecallResult(state, updatedResults, rawAnswer, latencyMs);
            }

            return {
                delayedRecallResults: updatedResults,
                delayedRecallWordIndex: nextWordIndex,
            };
        }

        return {};
    }

    private recordDelayedRecallResult(
        state: CognitiveStateType,
        retrievalLevels: RetrievalLevel[],
        rawAnswer: string,
        latencyMs?: number,
    ) {
        const totalScore = retrievalLevels.reduce((s, r) => s + r.score, 0);

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.DELAYED_RECALL,
            domain: TASK_SEQUENCE[state.currentTaskIndex].domain,
            rawAnswer,
            rawScore: totalScore,
            maxScore: 10,
            latencyMs,
            retrievalLevels,
        };

        return {
            taskResponses: [...state.taskResponses, taskResponse],
            delayedRecallPhase: 'free',
            delayedRecallWordIndex: 0,
            delayedRecallMissedWords: [],
        };
    }

    private routeNext(state: CognitiveStateType) {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];

        if (state.isComplete || state.currentPhase === 'complete') {
            return { currentPhase: 'complete' };
        }

        if (taskDef.taskType === CognitiveTaskType.WORD_REGISTRATION &&
            !state.registrationComplete && state.registrationAttempts > 0) {
            return {}; 
        }

        if (taskDef.taskType === CognitiveTaskType.DIGIT_SPAN_FORWARD ||
            taskDef.taskType === CognitiveTaskType.DIGIT_SPAN_REVERSE) {
            const digitSet = getDigitSet(state.selectedDigitSet);
            const pool = taskDef.taskType === CognitiveTaskType.DIGIT_SPAN_FORWARD
                ? digitSet.forward : digitSet.reverse;

            if (state.digitSpanCurrentTrial === 'B' && pool[state.digitSpanCurrentLength]) {
                return {}; 
            }
            if (pool[state.digitSpanCurrentLength] && state.digitSpanCurrentTrial === 'A') {
                return {};
            }
        }

        if (taskDef.taskType === CognitiveTaskType.SERIAL_7S && state.usedWorldAlternative &&
            !state.taskResponses.some(r => r.taskType === CognitiveTaskType.SERIAL_7S)) {
            return {}; 
        }

        if (taskDef.taskType === CognitiveTaskType.ABSTRACTION && state.taskAttempts === 1) {
            return {};
        }

        if (taskDef.taskType === CognitiveTaskType.DELAYED_RECALL) {
            if (state.delayedRecallPhase === 'cued' && state.delayedRecallWordIndex < state.delayedRecallMissedWords.length) {
                return {}; 
            }
            if (state.delayedRecallPhase === 'recognition' && state.delayedRecallWordIndex < state.delayedRecallMissedWords.length) {
                return {}; 
            }
        }

        const nextIndex = state.currentTaskIndex + 1;

        if (nextIndex >= TASK_SEQUENCE.length) {
            return { isComplete: true, currentPhase: 'complete' };
        }

        return { currentTaskIndex: nextIndex, taskAttempts: 0 };
    }

    private routeAfterTask(state: CognitiveStateType): string {
        if (state.isComplete || state.currentPhase === 'complete') return "finalize";
        return "prompt_task";
    }

    private async finalize(state: CognitiveStateType) {
        let responseText: string;

        if (state.isDeferred) {
            if (state.deferralReason === 'distress_detected') {
                responseText = "That's completely okay — let's not do this today. We can reschedule for when you're feeling better. Take care of yourself.";
            } else {
                responseText = "No problem at all. We can do this another time. Take care!";
            }
        } else if (state.isPartial) {
            responseText = "That's alright — we'll pick up from here next time. Thank you for what you've done today. Take care!";
        } else {
            responseText = "And that's it — you're all done. That was really great of you to do this with me. Is there anything you'd like to chat about, or shall we wrap up for today?";
        }

        console.log('[CognitiveGraph] Finalized:', {
            userId: state.userId,
            isComplete: !state.isDeferred && !state.isPartial,
            isDeferred: state.isDeferred,
            isPartial: state.isPartial,
            tasksCompleted: state.taskResponses.length,
        });

        return {
            response: responseText,
            isComplete: true,
            currentPhase: 'complete',
        };
    }

    private buildTaskPrompt(state: CognitiveStateType, taskType: CognitiveTaskType): string {
        const taskIndex = state.currentTaskIndex;
        const totalTasks = TASK_SEQUENCE.length;
        let context = `You are nAIber, conducting a brief mind exercise with an elderly user.\n`;
        context += `Progress: Task ${taskIndex + 1} of ${totalTasks}.\n\n`;

        switch (taskType) {
            case CognitiveTaskType.ORIENTATION:
                context += `## Task: Orientation\n`;
                context += `Say this warmly: "Let's start with something simple. Can you tell me what today's date is? And what month are we in? What year? And what season would you say we're in right now?"\n`;
                context += `Deliver it naturally — you can paraphrase slightly but cover all four: date, month, year, season.\n`;
                context += `Affirmation after: "Perfect, thank you."`;
                break;

            case CognitiveTaskType.WORD_REGISTRATION: {
                const words = state.registrationWords.join('... ');
                if (state.registrationAttempts > 0) {
                    context += `## Task: Word Registration (Retry)\n`;
                    context += `The user didn't repeat all the words. Read the list ONE more time clearly:\n`;
                    context += `"Let me say them once more: ${words}. Can you say those back to me?"\n`;
                } else {
                    context += `## Task: Word Registration\n`;
                    context += `Say: "I'm going to say five words, and I'd like you to repeat them back to me when I'm done. Don't worry about remembering them for now — just repeat them after me. Ready?"\n`;
                    context += `Then read clearly, one per second: ${words}\n`;
                    context += `Then: "Can you say those back to me?"\n`;
                    context += `After their response: "Good. Now, I'd like you to try to hold onto those words because I'll ask you about them again a little later."`;
                }
                break;
            }

            case CognitiveTaskType.DIGIT_SPAN_FORWARD: {
                const digitSet = getDigitSet(state.selectedDigitSet);
                const length = state.digitSpanCurrentLength;
                const trial = state.digitSpanCurrentTrial as 'A' | 'B';
                const lengthData = digitSet.forward[length];

                if (!lengthData) break;

                const sequence = trial === 'A' ? lengthData.trialA : lengthData.trialB;
                const digits = sequence.join('... ');

                if (length === 3 && trial === 'A') {
                    context += `## Task: Digit Span Forward\n`;
                    context += `Say: "I'm going to read some numbers. When I'm done, can you repeat them back to me in the same order I said them? Here we go:"\n`;
                }
                context += `Read these digits clearly, one per second: ${digits}\n`;
                context += `Wait for their response.`;
                break;
            }

            case CognitiveTaskType.DIGIT_SPAN_REVERSE: {
                const digitSet = getDigitSet(state.selectedDigitSet);
                const length = state.digitSpanCurrentLength;
                const trial = state.digitSpanCurrentTrial as 'A' | 'B';
                const lengthData = digitSet.reverse[length];

                if (!lengthData) break;

                const sequence = trial === 'A' ? lengthData.trialA : lengthData.trialB;
                const digits = sequence.join('... ');

                if (length === 3 && trial === 'A') {
                    context += `## Task: Digit Span Reverse\n`;
                    context += `Say: "Good, let's try a slightly different version. This time, when I read the numbers, I'd like you to say them back to me in reverse order — so the last number first. So if I said 1, 2 — you'd say 2, 1. Give it a try:"\n`;
                }
                context += `Read these digits clearly, one per second: ${digits}\n`;
                context += `Wait for their response.`;
                break;
            }

            case CognitiveTaskType.SERIAL_7S:
                if (state.usedWorldAlternative) {
                    context += `## Task: WORLD Backward (Alternative)\n`;
                    context += `Say: "That's completely fine — instead, can you spell the word WORLD backwards for me? W-O-R-L-D, backwards."`;
                } else {
                    context += `## Task: Serial 7s\n`;
                    context += `Say: "I'd like you to start at 100 and keep subtracting 7. So 100, then subtract 7, then subtract 7 again, and keep going until I say stop. Take your time."\n`;
                    context += `Let them do 5 subtractions, then say "Good, thank you."`;
                }
                break;

            case CognitiveTaskType.LETTER_VIGILANCE: {
                const vigilanceSet = getVigilanceSet(state.selectedVigilanceSet);
                const letters = vigilanceSet.letters.join('... ');

                context += `## Task: Letter Vigilance\n`;
                context += `Say: "I'm going to read a list of letters. Every time you hear the letter A, I'd like you to say 'yes' out loud. Ready? Here we go — and take your time, there's no rush:"\n`;
                context += `Read these letters clearly, one per second: ${letters}\n`;
                context += `After reading all letters, ask: "And how many times did you hear the letter A in total?"`;
                break;
            }

            case CognitiveTaskType.LETTER_FLUENCY: {
                const letter = state.selectedLetter;
                context += `## Task: Letter Fluency\n`;
                context += `Say: "Now I'd like you to say as many words as you can that begin with the letter ${letter}. You have about a minute. The only rules are: no names of people or places, and no numbers. Just regular words — as many as you can think of. Ready? Go ahead."\n`;
                context += `IMPORTANT: Stay SILENT during their response. Do NOT prompt or affirm mid-task.\n`;
                context += `Only if they go silent for more than 10 seconds, say ONCE: "Take your time — anything that starts with ${letter}."\n`;
                context += `After about 60 seconds: "That was great."`;
                break;
            }

            case CognitiveTaskType.ABSTRACTION: {
                const abstractionSet = getAbstractionSet(state.selectedAbstractionSet);
                const pairIndex = state.taskAttempts;
                const pair = abstractionSet.pairs[pairIndex];

                if (pairIndex === 0) {
                    context += `## Task: Abstraction\n`;
                    context += `Say: "I'm going to name two things, and I'd like you to tell me how they're similar — what do they have in common?"\n`;
                }
                context += `Ask: "${pair.item1} and ${pair.item2} — how are they alike?"\n`;
                context += `Do NOT comment on correctness. Just listen and wait for their answer.`;
                break;
            }

            case CognitiveTaskType.DELAYED_RECALL: {
                if (state.delayedRecallPhase === 'free') {
                    context += `## Task: Delayed Recall (Free)\n`;
                    context += `Say: "Almost done. Earlier I mentioned five words and asked you to hold onto them. Can you remember what those words were? Take as much time as you need."`;
                } else if (state.delayedRecallPhase === 'cued') {
                    const wordList = getWordList(TASK_SEQUENCE.indexOf(TASK_SEQUENCE.find(t => t.taskType === CognitiveTaskType.WORD_REGISTRATION)!) >= 0
                        ? state.sessionIndex : 0);
                    const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];
                    const cue = wordList.categoryCues[currentWord] ?? 'something';

                    context += `## Task: Delayed Recall (Category Cue)\n`;
                    context += `Say: "One of the words was ${cue} — does that help you remember it?"`;
                } else if (state.delayedRecallPhase === 'recognition') {
                    const wordList = getWordList(state.sessionIndex);
                    const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];
                    const options = wordList.recognitionOptions[currentWord];

                    if (options) {
                        context += `## Task: Delayed Recall (Recognition)\n`;
                        context += `Say: "Was it ${options[0]}, ${options[1]}, or ${options[2]}?"`;
                    }
                }
                break;
            }
        }

        return context;
    }

    private isExitIntent(rawAnswer: string): boolean {
        const normalized = rawAnswer.trim().toLowerCase();
        return EXIT_KEYWORDS.some(kw => normalized.includes(kw));
    }

    private detectDistress(rawAnswer: string): boolean {
        const normalized = rawAnswer.trim().toLowerCase();
        return DISTRESS_KEYWORDS.some(kw => normalized.includes(kw));
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