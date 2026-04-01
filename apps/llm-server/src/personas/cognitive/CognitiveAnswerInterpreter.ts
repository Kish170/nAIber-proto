import { ChatOpenAI } from "@langchain/openai";
import type { CognitiveStateType } from "./CognitiveState.js";
import { CognitiveTaskType } from "./tasks/TaskDefinitions.js";
import type { TaskDefinition, PerseverationSignals } from "./tasks/TaskDefinitions.js";
import {
    validateOrientation,
    validateWordRegistration,
    validateDigitSpan,
    validateSerial7s,
    validateLetterFluency,
    validateAbstraction,
    validateFreeRecall,
    validateCuedRecall,
    validateRecognition,
} from "./tasks/TaskValidation.js";
import { getDigitSet, getAbstractionSet } from "./tasks/ContentRotation.js";
import { IntentClassifier } from "../health/validation/IntentClassifier.js";

export interface TaskEvaluationResult {
    taskType: CognitiveTaskType;
    rawScore: number | null;
    maxScore: number | null;
    metadata: Record<string, unknown>;
}

export interface CognitiveInterpretationResult {
    intent: 'ANSWERING' | 'ASKING' | 'REFUSING';
    intentTier: 1 | 2;
    taskEvaluation: TaskEvaluationResult | null;
}

export class CognitiveAnswerInterpreter {
    private readonly intentClassifier: IntentClassifier;

    constructor(private readonly llm: ChatOpenAI) {
        this.intentClassifier = new IntentClassifier(llm);
    }

    async interpret(task: TaskDefinition | undefined, state: CognitiveStateType): Promise<CognitiveInterpretationResult> {
        if (!task) {
            return { intent: 'ANSWERING', intentTier: 1, taskEvaluation: null };
        }

        const wordCount = state.rawAnswer.trim().split(/\s+/).length;
        let intent: 'ANSWERING' | 'ASKING' | 'REFUSING' = 'ANSWERING';
        let tier: 1 | 2 = 1;
        let confidence = 1.0;

        if (wordCount > 3) {
            const classification = await this.intentClassifier.classify(state.rawAnswer);
            intent = classification.intent;
            tier = classification.tier;
            confidence = classification.confidence;
        }

        console.log('[Cognitive:interpret] intent=%s tier=%d confidence=%s taskType=%s', intent, tier, confidence.toFixed(2), task.taskType);

        if (intent !== 'ANSWERING') {
            return { intent, intentTier: tier, taskEvaluation: null };
        }

        return { intent, intentTier: tier, taskEvaluation: await this.evaluateTask(task, state) };
    }

    private async evaluateTask(task: TaskDefinition, state: CognitiveStateType): Promise<TaskEvaluationResult> {
        switch (task.taskType) {
            case CognitiveTaskType.WELLBEING:          return this.interpretWellbeing(task, state);
            case CognitiveTaskType.ORIENTATION:        return this.interpretOrientation(state);
            case CognitiveTaskType.WORD_REGISTRATION:  return this.interpretWordRegistration(state);
            case CognitiveTaskType.DIGIT_SPAN_FORWARD: return this.interpretDigitSpan(state, false);
            case CognitiveTaskType.DIGIT_SPAN_REVERSE: return this.interpretDigitSpan(state, true);
            case CognitiveTaskType.SERIAL_7S:          return this.interpretSerial7s(state);
            case CognitiveTaskType.LETTER_FLUENCY:     return this.interpretLetterFluency(state);
            case CognitiveTaskType.ABSTRACTION:        return await this.interpretAbstraction(state);
            case CognitiveTaskType.DELAYED_RECALL:     return this.interpretDelayedRecall(state);
            default:
                return { taskType: task.taskType, rawScore: null, maxScore: null, metadata: {} };
        }
    }

    private interpretWellbeing(task: TaskDefinition, state: CognitiveStateType): TaskEvaluationResult {
        return {
            taskType: CognitiveTaskType.WELLBEING,
            rawScore: null,
            maxScore: null,
            metadata: { wellbeingQuestion: task.prompt ?? '', rawAnswer: state.rawAnswer },
        };
    }

    private interpretOrientation(state: CognitiveStateType): TaskEvaluationResult {
        const result = validateOrientation(state.rawAnswer, new Date());
        return { taskType: CognitiveTaskType.ORIENTATION, rawScore: result.score, maxScore: result.maxScore, metadata: {} };
    }

    private interpretWordRegistration(state: CognitiveStateType): TaskEvaluationResult {
        const result = validateWordRegistration(state.rawAnswer, state.registrationWords);
        return { taskType: CognitiveTaskType.WORD_REGISTRATION, rawScore: null, maxScore: null, metadata: { registrationResult: result } };
    }

    private interpretDigitSpan(state: CognitiveStateType, isReverse: boolean): TaskEvaluationResult {
        const taskType = isReverse ? CognitiveTaskType.DIGIT_SPAN_REVERSE : CognitiveTaskType.DIGIT_SPAN_FORWARD;
        const maxScore = isReverse ? 4 : 5;
        const digitSet = getDigitSet(state.selectedDigitSet);
        const pool = isReverse ? digitSet.reverse : digitSet.forward;
        const lengthData = pool[state.digitSpanCurrentLength];

        if (!lengthData) {
            return { taskType, rawScore: null, maxScore, metadata: { correct: false, noMoreTrials: true } };
        }

        const trial = state.digitSpanCurrentTrial as 'A' | 'B';
        const targetSequence = trial === 'A' ? lengthData.trialA : lengthData.trialB;
        return { taskType, rawScore: null, maxScore, metadata: { correct: validateDigitSpan(state.rawAnswer, targetSequence, isReverse) } };
    }

    private interpretSerial7s(state: CognitiveStateType): TaskEvaluationResult {
        const score = validateSerial7s(state.rawAnswer).score;
        return { taskType: CognitiveTaskType.SERIAL_7S, rawScore: score, maxScore: 5, metadata: {} };
    }

    private interpretLetterFluency(state: CognitiveStateType): TaskEvaluationResult {
        const result = validateLetterFluency(state.rawAnswer, state.selectedLetter);
        return {
            taskType: CognitiveTaskType.LETTER_FLUENCY,
            rawScore: result.score,
            maxScore: null,
            metadata: { perseverationSignals: result.perseverationSignals as PerseverationSignals },
        };
    }

    private async interpretAbstraction(state: CognitiveStateType): Promise<TaskEvaluationResult> {
        const abstractionSet = getAbstractionSet(state.selectedAbstractionSet);
        const pairIndex = state.taskAttempts;
        const pair = abstractionSet.pairs[pairIndex];

        if (!pair) {
            return { taskType: CognitiveTaskType.ABSTRACTION, rawScore: 0, maxScore: 2, metadata: { pairIndex, noPair: true } };
        }

        const result = await validateAbstraction(state.rawAnswer, pair, this.llm);
        return { taskType: CognitiveTaskType.ABSTRACTION, rawScore: result.score, maxScore: 2, metadata: { pairIndex } };
    }

    private interpretDelayedRecall(state: CognitiveStateType): TaskEvaluationResult {
        const base = { taskType: CognitiveTaskType.DELAYED_RECALL, rawScore: null, maxScore: 10 as const };
        const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];

        switch (state.delayedRecallPhase) {
            case 'free': {
                const result = validateFreeRecall(state.rawAnswer, state.registrationWords);
                return { ...base, metadata: { phase: 'free', recalled: result.recalled, missed: result.missed, intrusions: result.intrusions } };
            }
            case 'cued':
                return { ...base, metadata: { phase: 'cued', recalled: validateCuedRecall(state.rawAnswer, currentWord), currentWord, wordIndex: state.delayedRecallWordIndex } };
            case 'recognition':
                return { ...base, metadata: { phase: 'recognition', recalled: validateRecognition(state.rawAnswer, currentWord), currentWord, wordIndex: state.delayedRecallWordIndex } };
            default:
                return { ...base, metadata: { phase: 'unknown' } };
        }
    }
}