import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type { TaskResponse, WellbeingResponse, RetrievalLevel, TaskDefinition } from "./tasks/TaskDefinitions.js";
import type { CognitiveInterpretationResult } from "./CognitiveAnswerInterpreter.js";
import type { CognitiveDecision } from "./CognitiveDecisionEngine.js";

const keep = <T>(fallback: T) => ({
    reducer: (x: T, y: T | undefined | null) => (y !== undefined && y !== null) ? y : (x !== undefined && x !== null ? x : fallback),
    default: () => fallback
});

export const CognitiveState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => []
    }),
    userId: Annotation<string>({
        reducer: (x, y) => y || x || '',
        default: () => ''
    }),
    conversationId: Annotation<string>({
        reducer: (x, y) => y || x || '',
        default: () => ''
    }),
    response: Annotation<string>(keep<string>("")),
    rawAnswer: Annotation<string>(keep<string>("")),

    currentTaskIndex: Annotation<number>(keep<number>(0)),

    sessionIndex: Annotation<number>(keep<number>(0)),
    selectedWordList: Annotation<string>(keep<string>("A")),
    registrationWords: Annotation<string[]>(keep<string[]>([])),
    selectedDigitSet: Annotation<number>(keep<number>(0)),
    selectedLetter: Annotation<string>(keep<string>("F")),
    selectedAbstractionSet: Annotation<number>(keep<number>(0)),
    selectedVigilanceSet: Annotation<number>(keep<number>(0)),

    wellbeingResponses: Annotation<WellbeingResponse[]>(keep<WellbeingResponse[]>([])),
    taskResponses: Annotation<TaskResponse[]>(keep<TaskResponse[]>([])),

    registrationComplete: Annotation<boolean>(keep<boolean>(false)),
    registrationQuality: Annotation<string>(keep<string>("")), 
    registrationAttempts: Annotation<number>(keep<number>(0)),

    digitSpanCurrentLength: Annotation<number>(keep<number>(3)),
    digitSpanCurrentTrial: Annotation<string>(keep<string>("A")), // 'A' | 'B'
    digitSpanLongestForward: Annotation<number>(keep<number>(0)),
    digitSpanLongestReverse: Annotation<number>(keep<number>(0)),

    delayedRecallPhase: Annotation<string>(keep<string>("free")), // 'free' | 'cued' | 'recognition'
    delayedRecallWordIndex: Annotation<number>(keep<number>(0)),
    delayedRecallResults: Annotation<RetrievalLevel[]>(keep<RetrievalLevel[]>([])),
    delayedRecallMissedWords: Annotation<string[]>(keep<string[]>([])),

    taskAttempts: Annotation<number>(keep<number>(0)),

    tasks: Annotation<TaskDefinition[]>(keep<TaskDefinition[]>([])),
    lastInterpretation: Annotation<CognitiveInterpretationResult | null>(keep<CognitiveInterpretationResult | null>(null)),
    currentDecision: Annotation<CognitiveDecision | null>(keep<CognitiveDecision | null>(null)),

    isComplete: Annotation<boolean>(keep<boolean>(false)),
    isDeferred: Annotation<boolean>(keep<boolean>(false)),
    deferralReason: Annotation<string>(keep<string>("")),
    distressDetected: Annotation<boolean>(keep<boolean>(false)),
    isPartial: Annotation<boolean>(keep<boolean>(false)),

    taskStartTimestamp: Annotation<number>(keep<number>(0)),
});

export type CognitiveStateType = typeof CognitiveState.State;