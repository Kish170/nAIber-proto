import { Annotation } from '@langchain/langgraph';
import type { TaskResponse, WellbeingResponse } from '../tasks/TaskDefinitions.js';

export const CognitivePostCallState = Annotation.Root({
    userId:                 Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    conversationId:         Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    taskResponses:          Annotation<TaskResponse[]>({ reducer: (_, b) => b, default: () => [] }),
    wellbeingResponses:     Annotation<WellbeingResponse[]>({ reducer: (_, b) => b, default: () => [] }),
    sessionIndex:           Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
    selectedWordList:       Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    selectedDigitSet:       Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
    selectedLetter:         Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    selectedAbstractionSet: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
    selectedVigilanceSet:   Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
    registrationQuality:    Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    distressDetected:       Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
    isPartial:              Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
    isDeferred:             Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
    deferralReason:         Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    error:                  Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

export type CognitivePostCallStateType = typeof CognitivePostCallState.State;
