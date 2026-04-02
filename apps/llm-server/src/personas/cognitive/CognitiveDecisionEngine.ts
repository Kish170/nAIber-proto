import { CognitiveTaskType, TASK_SEQUENCE } from "./tasks/TaskDefinitions.js";
import { hasCompletionSignal } from "./tasks/TaskValidation.js";
import type { TaskDefinition, TaskResponse, RetrievalLevel, WellbeingResponse } from "./tasks/TaskDefinitions.js";
import { getDigitSet } from "./tasks/ContentRotation.js";
import type { CognitiveStateType } from "./CognitiveState.js";
import type { CognitiveInterpretationResult, TaskEvaluationResult } from "./CognitiveAnswerInterpreter.js";

export type CognitiveAction = 'advance' | 'stay' | 'skip' | 'defer' | 'clarify' | 'continue';

const MAX_CLARIFY_ATTEMPTS = 2;

export interface CognitiveDecision {
    action: CognitiveAction;
    reasoning: string;
    shouldAccumulateAnswer?: boolean;
}

export interface CognitiveDecisionResult {
    decision: CognitiveDecision;
    stateUpdates: Record<string, unknown>;
}

export class CognitiveDecisionEngine {
    evaluate(state: CognitiveStateType, interpretation: CognitiveInterpretationResult): CognitiveDecisionResult {
        if (state.isDeferred) {
            return { decision: { action: 'defer', reasoning: 'Already deferred' }, stateUpdates: {} };
        }

        const task = (state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE)[state.currentTaskIndex];
        if (!task) {
            return { decision: { action: 'skip', reasoning: 'No task at current index' }, stateUpdates: { isComplete: true } };
        }

        if (interpretation.intent === 'REFUSING') {
            return this.handleRefusing(state, task);
        }
        if (interpretation.intent === 'ASKING') {
            return this.handleAsking(state, task);
        }

        const eval_ = interpretation.taskEvaluation;
        if (!eval_) {
            return this.advance(state, task, null);
        }

        return this.dispatchTask(state, task, eval_);
    }

    private handleRefusing(state: CognitiveStateType, task: TaskDefinition): CognitiveDecisionResult {
        const taskResponse: TaskResponse = {
            taskType: task.taskType,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore: 0,
            maxScore: null,
            skipped: true,
            skipReason: 'refused',
        };
        return {
            decision: { action: 'skip', reasoning: `User refused ${task.taskType}` },
            stateUpdates: {
                taskResponses: [...state.taskResponses, taskResponse],
                currentTaskIndex: state.currentTaskIndex + 1,
                taskAttempts: 0,
            },
        };
    }

    private handleAsking(state: CognitiveStateType, task: TaskDefinition): CognitiveDecisionResult {
        if (state.taskAttempts >= MAX_CLARIFY_ATTEMPTS) {
            console.log('[Cognitive:decide] clarify cap reached — skipping task %s', task.taskType);
            const taskResponse: TaskResponse = {
                taskType: task.taskType,
                domain: task.domain,
                rawAnswer: state.rawAnswer,
                rawScore: 0,
                maxScore: null,
                skipped: true,
                skipReason: 'exhausted',
            };
            return {
                decision: { action: 'skip', reasoning: `Clarification attempts exhausted for ${task.taskType}` },
                stateUpdates: {
                    taskResponses: [...state.taskResponses, taskResponse],
                    currentTaskIndex: state.currentTaskIndex + 1,
                    taskAttempts: 0,
                },
            };
        }
        return {
            decision: { action: 'clarify', reasoning: `User asked for clarification on ${task.taskType}` },
            stateUpdates: { taskAttempts: state.taskAttempts + 1 },
        };
    }

    private dispatchTask(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        switch (task.taskType) {
            case CognitiveTaskType.WELLBEING:          return this.decideWellbeing(state, task, eval_);
            case CognitiveTaskType.ORIENTATION:        return this.decideOrientation(state, task, eval_);
            case CognitiveTaskType.WORD_REGISTRATION:  return this.decideWordRegistration(state, task, eval_);
            case CognitiveTaskType.DIGIT_SPAN_FORWARD: return this.decideDigitSpan(state, task, eval_, false);
            case CognitiveTaskType.DIGIT_SPAN_REVERSE: return this.decideDigitSpan(state, task, eval_, true);
            case CognitiveTaskType.SERIAL_7S:          return this.decideSerial7s(state, task, eval_);
            case CognitiveTaskType.LETTER_FLUENCY:     return this.decideLetterFluency(state, task, eval_);
            case CognitiveTaskType.ABSTRACTION:        return this.decideAbstraction(state, task, eval_);
            case CognitiveTaskType.DELAYED_RECALL:     return this.decideDelayedRecall(state, task, eval_);
            default:
                return this.advance(state, task, null);
        }
    }

    private decideWellbeing(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const wellbeingResponse: WellbeingResponse = {
            questionIndex: state.currentTaskIndex,
            question: eval_.metadata.wellbeingQuestion as string,
            rawAnswer: state.rawAnswer,
            distressDetected: false,
        };
        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.WELLBEING,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore: 0,
            maxScore: null,
        };
        return {
            decision: { action: 'advance', reasoning: 'Wellbeing check-in recorded' },
            stateUpdates: {
                wellbeingResponses: [...state.wellbeingResponses, wellbeingResponse],
                taskResponses: [...state.taskResponses, taskResponse],
                currentTaskIndex: state.currentTaskIndex + 1,
                taskAttempts: 0,
            },
        };
    }

    private decideOrientation(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.ORIENTATION,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore: eval_.rawScore as number,
            maxScore: 5,
            latencyMs: this.latency(state),
        };
        return this.advance(state, task, taskResponse);
    }

    private decideWordRegistration(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const { registrationComplete, registrationQuality } = eval_.metadata.registrationResult as {
            registrationComplete: boolean;
            registrationQuality: 'complete' | 'partial';
        };

        if (!registrationComplete && state.registrationAttempts < 1) {
            return {
                decision: { action: 'stay', reasoning: 'Word registration incomplete — one retry allowed' },
                stateUpdates: { registrationAttempts: state.registrationAttempts + 1, registrationComplete: false },
            };
        }

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.WORD_REGISTRATION,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore: 0,
            maxScore: null,
            latencyMs: this.latency(state),
            registrationQuality,
        };
        return {
            decision: { action: 'advance', reasoning: 'Word registration complete' },
            stateUpdates: {
                taskResponses: [...state.taskResponses, taskResponse],
                registrationComplete,
                registrationQuality,
                registrationAttempts: 0,
                currentTaskIndex: state.currentTaskIndex + 1,
                taskAttempts: 0,
            },
        };
    }

    private decideDigitSpan(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult, isReverse: boolean): CognitiveDecisionResult {
        const { correct, noMoreTrials } = eval_.metadata as { correct: boolean; noMoreTrials?: boolean };

        if (noMoreTrials) {
            return this.recordDigitSpanResult(state, task, isReverse);
        }

        const digitSet = getDigitSet(state.selectedDigitSet);
        const pool = isReverse ? digitSet.reverse : digitSet.forward;
        const length = state.digitSpanCurrentLength;
        const longestKey = isReverse ? 'digitSpanLongestReverse' : 'digitSpanLongestForward';
        const currentLongest = isReverse ? state.digitSpanLongestReverse : state.digitSpanLongestForward;

        if (correct) {
            const newLongest = Math.max(currentLongest, length);
            const nextLength = length + 1;

            if (pool[nextLength]) {
                return {
                    decision: { action: 'stay', reasoning: `Digit span correct at length ${length}, advancing to ${nextLength}` },
                    stateUpdates: { [longestKey]: newLongest, digitSpanCurrentLength: nextLength, digitSpanCurrentTrial: 'A' },
                };
            }
            return this.recordDigitSpanResult({ ...state, [longestKey]: newLongest } as CognitiveStateType, task, isReverse);
        }

        if (state.digitSpanCurrentTrial === 'A') {
            return {
                decision: { action: 'stay', reasoning: 'Digit span incorrect on trial A, trying trial B' },
                stateUpdates: { digitSpanCurrentTrial: 'B' },
            };
        }

        return this.recordDigitSpanResult(state, task, isReverse);
    }

    private recordDigitSpanResult(state: CognitiveStateType, task: TaskDefinition, isReverse: boolean): CognitiveDecisionResult {
        const taskType = isReverse ? CognitiveTaskType.DIGIT_SPAN_REVERSE : CognitiveTaskType.DIGIT_SPAN_FORWARD;
        const maxScore = isReverse ? 4 : 5;
        const longestKey = isReverse ? 'digitSpanLongestReverse' : 'digitSpanLongestForward';
        const rawScore = isReverse ? state.digitSpanLongestReverse : state.digitSpanLongestForward;

        const taskResponse: TaskResponse = {
            taskType,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore,
            maxScore,
            latencyMs: this.latency(state),
        };
        return {
            decision: { action: 'advance', reasoning: `Digit span (${isReverse ? 'reverse' : 'forward'}) complete` },
            stateUpdates: {
                taskResponses: [...state.taskResponses, taskResponse],
                [longestKey]: rawScore,
                digitSpanCurrentLength: 3,
                digitSpanCurrentTrial: 'A',
                currentTaskIndex: state.currentTaskIndex + 1,
                taskAttempts: 0,
            },
        };
    }

    private decideSerial7s(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const { completionSignalPresent } = eval_.metadata as { completionSignalPresent: boolean };
        const score = eval_.rawScore as number;

        if (!completionSignalPresent && score < 2) {
            console.log('[Cognitive:decide] Serial7s partial answer (score=%d) — waiting for completion signal', score);
            return {
                decision: { action: 'continue', reasoning: 'Partial Serial 7s answer — waiting for completion signal', shouldAccumulateAnswer: true },
                stateUpdates: {},
            };
        }

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.SERIAL_7S,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore: score,
            maxScore: 5,
            latencyMs: this.latency(state),
        };
        return this.advance(state, task, taskResponse);
    }

    private decideLetterFluency(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const { completionSignalPresent } = eval_.metadata as { completionSignalPresent: boolean };
        const score = eval_.rawScore as number;

        if (!completionSignalPresent && score < 5) {
            console.log('[Cognitive:decide] LetterFluency partial answer (score=%d) — waiting for completion signal', score);
            return {
                decision: { action: 'continue', reasoning: 'Partial fluency answer — waiting for completion signal', shouldAccumulateAnswer: true },
                stateUpdates: {},
            };
        }

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.LETTER_FLUENCY,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore: score,
            maxScore: null,
            latencyMs: this.latency(state),
            perseverationSignals: eval_.metadata.perseverationSignals as any,
        };
        return this.advance(state, task, taskResponse);
    }

    private decideAbstraction(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const { pairIndex, noPair } = eval_.metadata as { pairIndex: number; noPair?: boolean };

        if (noPair) {
            return this.advance(state, task, null);
        }

        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.ABSTRACTION,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore: eval_.rawScore as number,
            maxScore: 2,
            latencyMs: this.latency(state),
        };

        if (pairIndex === 0) {
            return {
                decision: { action: 'stay', reasoning: 'First abstraction pair done, presenting second' },
                stateUpdates: { abstractionPairIndex: 1, taskResponses: [...state.taskResponses, taskResponse] },
            };
        }

        return {
            decision: { action: 'advance', reasoning: 'Both abstraction pairs done' },
            stateUpdates: {
                taskResponses: [...state.taskResponses, taskResponse],
                abstractionPairIndex: 0,
                taskAttempts: 0,
                currentTaskIndex: state.currentTaskIndex + 1,
            },
        };
    }

    private decideDelayedRecall(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const { phase } = eval_.metadata as { phase: string };

        switch (phase) {
            case 'free':        return this.decideDelayedRecallFree(state, task, eval_);
            case 'cued':        return this.decideDelayedRecallCued(state, task, eval_);
            case 'recognition': return this.decideDelayedRecallRecognition(state, task, eval_);
            default:            return this.advance(state, task, null);
        }
    }

    private decideDelayedRecallFree(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const { recalled, missed, intrusions } = eval_.metadata as { recalled: string[]; missed: string[]; intrusions: string[] };
        const retrievalLevels: RetrievalLevel[] = recalled.map(word => ({ word, level: 'free' as const, score: 2 }));

        if (missed.length === 0) {
            return this.recordDelayedRecallResult(state, task, retrievalLevels, intrusions);
        }

        return {
            decision: { action: 'stay', reasoning: `${missed.length} words missed in free recall — starting cued phase` },
            stateUpdates: {
                delayedRecallResults: retrievalLevels,
                delayedRecallMissedWords: missed,
                delayedRecallPhase: 'cued',
                delayedRecallWordIndex: 0,
            },
        };
    }

    private decideDelayedRecallCued(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const { recalled, currentWord, wordIndex } = eval_.metadata as { recalled: boolean; currentWord: string; wordIndex: number };

        const updatedResults: RetrievalLevel[] = recalled
            ? [...state.delayedRecallResults, { word: currentWord, level: 'cued' as const, score: 1 }]
            : [...state.delayedRecallResults];

        const nextWordIndex = wordIndex + 1;

        if (nextWordIndex < state.delayedRecallMissedWords.length) {
            return {
                decision: { action: 'stay', reasoning: 'Continuing cued recall phase' },
                stateUpdates: { delayedRecallResults: updatedResults, delayedRecallWordIndex: nextWordIndex },
            };
        }

        const stillMissed = state.delayedRecallMissedWords.filter(w => !updatedResults.some(r => r.word === w));

        if (stillMissed.length === 0) {
            return this.recordDelayedRecallResult(state, task, updatedResults, []);
        }

        return {
            decision: { action: 'stay', reasoning: `Cued phase done — ${stillMissed.length} words still missed, starting recognition` },
            stateUpdates: {
                delayedRecallResults: updatedResults,
                delayedRecallMissedWords: stillMissed,
                delayedRecallPhase: 'recognition',
                delayedRecallWordIndex: 0,
            },
        };
    }

    private decideDelayedRecallRecognition(state: CognitiveStateType, task: TaskDefinition, eval_: TaskEvaluationResult): CognitiveDecisionResult {
        const { recalled, currentWord, wordIndex } = eval_.metadata as { recalled: boolean; currentWord: string; wordIndex: number };

        const updatedResults: RetrievalLevel[] = [
            ...state.delayedRecallResults,
            { word: currentWord, level: recalled ? 'recognition' as const : 'not_recalled' as const, score: 0 },
        ];

        const nextWordIndex = wordIndex + 1;

        if (nextWordIndex < state.delayedRecallMissedWords.length) {
            return {
                decision: { action: 'stay', reasoning: 'Continuing recognition phase' },
                stateUpdates: { delayedRecallResults: updatedResults, delayedRecallWordIndex: nextWordIndex },
            };
        }

        return this.recordDelayedRecallResult(state, task, updatedResults, []);
    }

    private recordDelayedRecallResult(state: CognitiveStateType, task: TaskDefinition, retrievalLevels: RetrievalLevel[], intrusionErrors: string[]): CognitiveDecisionResult {
        const taskResponse: TaskResponse = {
            taskType: CognitiveTaskType.DELAYED_RECALL,
            domain: task.domain,
            rawAnswer: state.rawAnswer,
            rawScore: retrievalLevels.reduce((s, r) => s + r.score, 0),
            maxScore: 10,
            latencyMs: this.latency(state),
            retrievalLevels,
            ...(intrusionErrors.length > 0 && { intrusionErrors }),
        };
        return {
            decision: { action: 'advance', reasoning: 'Delayed recall complete' },
            stateUpdates: {
                taskResponses: [...state.taskResponses, taskResponse],
                delayedRecallResults: retrievalLevels,
                delayedRecallPhase: 'free',
                delayedRecallWordIndex: 0,
                delayedRecallMissedWords: [],
                currentTaskIndex: state.currentTaskIndex + 1,
                taskAttempts: 0,
            },
        };
    }

    private advance(state: CognitiveStateType, task: TaskDefinition, taskResponse: TaskResponse | null): CognitiveDecisionResult {
        const stateUpdates: Record<string, unknown> = {
            currentTaskIndex: state.currentTaskIndex + 1,
            taskAttempts: 0,
        };
        if (taskResponse) {
            stateUpdates.taskResponses = [...state.taskResponses, taskResponse];
        }
        return {
            decision: { action: 'advance', reasoning: `${task.taskType} complete` },
            stateUpdates,
        };
    }

    private latency(state: CognitiveStateType): number | undefined {
        return state.taskStartTimestamp > 0 ? Date.now() - state.taskStartTimestamp : undefined;
    }
}