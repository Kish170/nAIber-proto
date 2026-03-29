import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { CognitiveState, CognitiveStateType } from "./CognitiveState.js";
import { CognitiveHandler } from "./CognitiveHandler.js";
import { CognitiveTaskType, TASK_SEQUENCE } from "./tasks/TaskDefinitions.js";
import type { TaskResponse, RetrievalLevel, WellbeingResponse } from "./tasks/TaskDefinitions.js";
import {
    getWordList,
    getDigitSet,
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

export class CognitiveGraph {
    private llm: ChatOpenAI;
    private compiledGraph: any;

    constructor(openAIClient: OpenAIClient, checkpointer: BaseCheckpointSaver) {
        this.llm = openAIClient.returnChatModel() as any;

        const graph: any = new StateGraph(CognitiveState);

        graph.addNode("orchestrator", this.orchestrate.bind(this));
        graph.addNode("prompt_task", this.promptTask.bind(this));
        graph.addNode("wait_for_input", this.waitForInput.bind(this));
        graph.addNode("evaluate_response", this.evaluateResponse.bind(this));
        graph.addNode("route_next", this.routeNext.bind(this));
        graph.addNode("finalize", this.finalize.bind(this));

        graph.setEntryPoint("orchestrator");
        graph.addEdge("orchestrator", "prompt_task");
        graph.addEdge("prompt_task", "wait_for_input");
        graph.addEdge("wait_for_input", "evaluate_response");
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
            currentTaskIndex: 0,
        };
    }

    private async promptTask(state: CognitiveStateType) {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];

        if (!taskDef) {
            console.error('[CognitiveGraph] No task at index:', state.currentTaskIndex);
            return { isComplete: true };
        }

        const promptText = this.buildTaskPrompt(state, taskDef.taskType);

        const lastUserMsg = state.messages.length > 0
            ? [state.messages[state.messages.length - 1]]
            : [];
        const messages = [new SystemMessage(promptText), ...lastUserMsg];
        const response = await this.llm.invoke(messages);
        const content = this.extractContent(response);

        console.log('[CognitiveGraph] Task prompt:', {
            taskIndex: state.currentTaskIndex,
            taskType: taskDef.taskType,
            total: TASK_SEQUENCE.length,
            messageCount: state.messages.length,
        });

        return {
            response: content,
            taskStartTimestamp: Date.now(),
        };
    }

    private waitForInput(state: CognitiveStateType) {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];

        const userAnswer = interrupt({
            taskIndex: state.currentTaskIndex,
            taskType: taskDef?.taskType,
            response: state.response,
        });

        return { rawAnswer: String(userAnswer) };
    }

    private async evaluateResponse(state: CognitiveStateType) {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];
        const rawAnswer = state.rawAnswer;

        const latencyMs = state.taskStartTimestamp > 0 ? Date.now() - state.taskStartTimestamp : undefined;

        switch (taskDef.taskType) {
            case CognitiveTaskType.WELLBEING:
                return this.evaluateWellbeing(state, rawAnswer);

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

    private evaluateWellbeing(state: CognitiveStateType, rawAnswer: string) {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];

        const wellbeingResponse: WellbeingResponse = {
            questionIndex: state.currentTaskIndex,
            question: taskDef.prompt ?? '',
            rawAnswer,
            distressDetected: false, // MCP tool will handle distress detection
        };

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.WELLBEING,
            domain: taskDef.domain,
            rawAnswer,
            rawScore: 0,
            maxScore: null,
        };

        return {
            wellbeingResponses: [...state.wellbeingResponses, wellbeingResponse],
            taskResponses: [...state.taskResponses, taskResponse],
        };
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

        console.log('[CognitiveGraph] route_next:', {
            taskIndex: state.currentTaskIndex,
            taskType: taskDef?.taskType,
            isComplete: state.isComplete,
            registrationComplete: state.registrationComplete,
            registrationAttempts: state.registrationAttempts,
            taskResponseCount: state.taskResponses.length,
        });

        if (state.isComplete) {
            return {};
        }

        // Multi-turn task checks: stay on the same task if not finished
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
            return { isComplete: true };
        }

        return { currentTaskIndex: nextIndex, taskAttempts: 0 };
    }

    private routeAfterTask(state: CognitiveStateType): string {
        if (state.isComplete) return "finalize";
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
        };
    }

    private buildTaskPrompt(state: CognitiveStateType, taskType: CognitiveTaskType): string {
        const taskDef = TASK_SEQUENCE[state.currentTaskIndex];
        const taskIndex = state.currentTaskIndex;
        const totalTasks = TASK_SEQUENCE.length;

        if (taskType === CognitiveTaskType.WELLBEING) {
            const isFirst = taskIndex === 0;
            const systemPrompt = isFirst
                ? `You are nAIber, a warm AI companion conducting a brief wellness check before a mind exercise.\n` +
                  `Ask the following question warmly and conversationally. This is the opening check-in.\n` +
                  `Question: "${taskDef.prompt}"\n` +
                  `Keep it brief and natural — one or two sentences.`
                : `You are nAIber. Continue the pre-exercise check-in warmly.\n` +
                  `Ask: "${taskDef.prompt}"\n` +
                  `Keep it brief — acknowledge their previous answer naturally before asking.`;
            return systemPrompt;
        }

        let context = `You are nAIber, conducting a brief mind exercise with an elderly user.\n`;
        context += `Progress: Task ${taskIndex + 1} of ${totalTasks}.\n`;
        context += `IMPORTANT: Follow the task instructions below EXACTLY. Say ONLY what is scripted. Do NOT repeat, reference, or continue any previous task.\n\n`;

        switch (taskType) {
            case CognitiveTaskType.ORIENTATION:
                context += `## CURRENT TASK: Orientation\n`;
                context += `Briefly acknowledge their previous answer, then say warmly: "${taskDef.prompt}"\n`;
                context += `Deliver it naturally — you can paraphrase slightly but cover all four: date, month, year, season.`;
                break;

            case CognitiveTaskType.WORD_REGISTRATION: {
                const words = state.registrationWords.join('... ');
                if (state.registrationAttempts > 0) {
                    context += `## CURRENT TASK: Word Registration (Retry)\n`;
                    context += `The user didn't repeat all the words. Read the list ONE more time clearly:\n`;
                    context += `Say exactly: "Let me say them once more: ${words}. Can you say those back to me?"`;
                } else {
                    context += `## CURRENT TASK: Word Registration\n`;
                    context += `Say: "${taskDef.prompt}"\n`;
                    context += `Then read clearly, one per second: ${words}\n`;
                    context += `Then say: "Can you say those back to me?"`;
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

                context += `## CURRENT TASK: Digit Span Forward (${length}-digit, trial ${trial})\n`;
                if (length === 3 && trial === 'A') {
                    context += `This is a NEW task. Say: "${taskDef.prompt} Here we go:"\n`;
                } else {
                    context += `Say: "Good. Let's try another set:"\n`;
                }
                context += `Then read EXACTLY these digits, one per second: ${digits}\n`;
                context += `Say ONLY these digits — do NOT make up different numbers. Wait for their response.`;
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

                context += `## CURRENT TASK: Digit Span Reverse (${length}-digit, trial ${trial})\n`;
                if (length === 3 && trial === 'A') {
                    context += `This is a NEW task — we are done with forward digits.\n`;
                    context += `Say: "Good, now let's try a slightly different version. ${taskDef.prompt} So if I said 1, 2 — you'd say 2, 1. Let's give it a try:"\n`;
                } else {
                    context += `Say: "Good. Here's another set:"\n`;
                }
                context += `Then read EXACTLY these digits, one per second: ${digits}\n`;
                context += `Say ONLY these digits — do NOT make up different numbers. Wait for their response.`;
                break;
            }

            case CognitiveTaskType.SERIAL_7S:
                if (state.usedWorldAlternative) {
                    context += `## CURRENT TASK: WORLD Backward (Alternative)\n`;
                    context += `Say exactly: "That's completely fine — instead, can you spell the word WORLD backwards for me? W-O-R-L-D, backwards."`;
                } else {
                    context += `## CURRENT TASK: Serial 7s\n`;
                    context += `This is a NEW task — we are done with digit sequences.\n`;
                    context += `Briefly acknowledge their effort on the previous task, then say: "${taskDef.prompt}"`;
                }
                break;

            case CognitiveTaskType.LETTER_VIGILANCE: {
                const vigilanceSet = getVigilanceSet(state.selectedVigilanceSet);
                const letters = vigilanceSet.letters.join('... ');

                context += `## CURRENT TASK: Letter Vigilance\n`;
                context += `This is a NEW task — we are done with subtraction.\n`;
                context += `Say: "${taskDef.prompt} Ready? Here we go — and take your time, there's no rush:"\n`;
                context += `Then read EXACTLY these letters clearly, one per second: ${letters}\n`;
                context += `After reading ALL letters, ask: "And how many times did you hear the letter A in total?"`;
                break;
            }

            case CognitiveTaskType.LETTER_FLUENCY: {
                const letter = state.selectedLetter;
                context += `## CURRENT TASK: Letter Fluency\n`;
                context += `This is a NEW task — we are done with letter listening.\n`;
                context += `Acknowledge their previous answer, then say: "${taskDef.prompt} The letter is ${letter}. Ready? Go ahead."`;
                break;
            }

            case CognitiveTaskType.ABSTRACTION: {
                const abstractionSet = getAbstractionSet(state.selectedAbstractionSet);
                const pairIndex = state.taskAttempts;
                const pair = abstractionSet.pairs[pairIndex];

                context += `## CURRENT TASK: Abstraction (pair ${pairIndex + 1} of 2)\n`;
                if (pairIndex === 0) {
                    context += `This is a NEW task — we are done with word fluency.\n`;
                    context += `Say: "${taskDef.prompt}"\n`;
                } else {
                    context += `Say: "Good. Here's another pair:"\n`;
                }
                context += `Ask: "${pair.item1} and ${pair.item2} — how are they alike?"\n`;
                context += `Do NOT comment on correctness. Just listen and wait for their answer.`;
                break;
            }

            case CognitiveTaskType.DELAYED_RECALL: {
                if (state.delayedRecallPhase === 'free') {
                    context += `## CURRENT TASK: Delayed Recall (Free)\n`;
                    context += `This is a NEW task — we are done with similarities.\n`;
                    context += `Say: "Almost done. ${taskDef.prompt} Take as much time as you need."`;
                } else if (state.delayedRecallPhase === 'cued') {
                    const wordList = getWordList(TASK_SEQUENCE.indexOf(TASK_SEQUENCE.find(t => t.taskType === CognitiveTaskType.WORD_REGISTRATION)!) >= 0
                        ? state.sessionIndex : 0);
                    const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];
                    const cue = wordList.categoryCues[currentWord] ?? 'something';

                    context += `## CURRENT TASK: Delayed Recall (Category Cue)\n`;
                    context += `Say: "One of the words was ${cue} — does that help you remember it?"`;
                } else if (state.delayedRecallPhase === 'recognition') {
                    const wordList = getWordList(state.sessionIndex);
                    const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];
                    const options = wordList.recognitionOptions[currentWord];

                    if (options) {
                        context += `## CURRENT TASK: Delayed Recall (Recognition)\n`;
                        context += `Say: "Was it ${options[0]}, ${options[1]}, or ${options[2]}?"`;
                    }
                }
                break;
            }
        }

        return context;
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
