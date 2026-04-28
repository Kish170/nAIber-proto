import { Annotation } from '@langchain/langgraph';
import type { TaskResponse, WellbeingResponse } from '../tasks/TaskDefinitions.js';
import type { DomainScores, DomainInterpretation } from '../scoring/ScoringEngine.js';

export const CognitivePostCallState = Annotation.Root({
    userId:                 Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    conversationId:         Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    taskResponses:          Annotation<TaskResponse[]>({ reducer: (_: TaskResponse[], b: TaskResponse[]) => b, default: () => [] }),
    wellbeingResponses:     Annotation<WellbeingResponse[]>({ reducer: (_: WellbeingResponse[], b: WellbeingResponse[]) => b, default: () => [] }),
    sessionIndex:           Annotation<number>({ reducer: (_: number, b: number) => b, default: () => 0 }),
    selectedWordList:       Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    selectedDigitSet:       Annotation<number>({ reducer: (_: number, b: number) => b, default: () => 0 }),
    selectedLetter:         Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    selectedAbstractionSet: Annotation<number>({ reducer: (_: number, b: number) => b, default: () => 0 }),
    selectedVigilanceSet:   Annotation<number>({ reducer: (_: number, b: number) => b, default: () => 0 }),
    registrationQuality:    Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    distressDetected:       Annotation<boolean>({ reducer: (_: boolean, b: boolean) => b, default: () => false }),
    isPartial:              Annotation<boolean>({ reducer: (_: boolean, b: boolean) => b, default: () => false }),
    isDeferred:             Annotation<boolean>({ reducer: (_: boolean, b: boolean) => b, default: () => false }),
    deferralReason:         Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    error:                  Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    domainScores:           Annotation<DomainScores | null>({ reducer: (_: DomainScores | null, b: DomainScores | null) => b, default: () => null }),
    stabilityIndex:         Annotation<number>({ reducer: (_: number, b: number) => b, default: () => 0 }),
    demographicInterpretation: Annotation<DomainInterpretation | null>({ reducer: (_: DomainInterpretation | null, b: DomainInterpretation | null) => b, default: () => null }),
});

export type CognitivePostCallStateType = typeof CognitivePostCallState.State;
