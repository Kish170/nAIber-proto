import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { QuestionData } from "./questions/index.js";
import type { ExtractionMethod, ExtractionResult } from "./validation/AnswerExtractor.js";
import type { AnswerSignals } from "./validation/SignalDetector.js";

export interface HealthCheckAnswer {
    questionIndex: number;
    question: QuestionData;
    rawAnswer: string;
    validatedAnswer: string;
    isValid: boolean;
    attemptCount: number;
    extractionMethod: ExtractionMethod;
    confidence: number;
    skipReason?: 'refused' | 'exhausted';
}

export interface FollowUpEvaluation {
    question: string;
    reason: string;
}

export interface InterpretationResult {
    intent: 'ANSWERING' | 'ASKING' | 'REFUSING' | 'CONFIRMING';
    intentTier: 1 | 2;
    extraction?: ExtractionResult;
    signals: AnswerSignals;
    followUp?: FollowUpEvaluation;
}

export interface AgentDecision {
    extractedSlots: Record<string, string | number | boolean | null>;
    confidence: number;
    action: 'next' | 'followup' | 'confirm' | 'retry' | 'skip' | 'wrap_up';
    followupQuestion?: string;
    confirmQuestion?: string;
    reasoning: string;
}

const keep = <T>(fallback: T) => ({
    reducer: (x: T, y: T | undefined | null) => (y !== undefined && y !== null) ? y : (x !== undefined && x !== null ? x : fallback),
    default: () => fallback
});

export const HealthCheckState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => []
    }),
    userId: Annotation<string>({
        reducer: (x: string, y: string) => y || x || '',
        default: () => ''
    }),
    conversationId: Annotation<string>({
        reducer: (x: string, y: string) => y || x || '',
        default: () => ''
    }),

    healthCheckQuestions: Annotation<QuestionData[]>(keep<QuestionData[]>([])),
    currentQuestionIndex: Annotation<number>(keep<number>(0)),
    questionAttempts: Annotation<number>(keep<number>(0)),
    healthCheckAnswers: Annotation<HealthCheckAnswer[]>(keep<HealthCheckAnswer[]>([])),

    rawAnswer: Annotation<string>(keep<string>("")),
    validatedAnswer: Annotation<string>(keep<string>("")),
    isValid: Annotation<boolean>(keep<boolean>(false)),
    isHealthCheckComplete: Annotation<boolean>(keep<boolean>(false)),
    lastValidationError: Annotation<string>(keep<string>("")),
    pendingClarification: Annotation<boolean>(keep<boolean>(false)),
    clarificationContext: Annotation<string>(keep<string>("")),
    response: Annotation<string>(keep<string>("")),

    lastInterpretation: Annotation<InterpretationResult | null>({
        reducer: (_x: InterpretationResult | null, y: InterpretationResult | null) => (y !== undefined ? y : null),
        default: () => null
    }),
    currentDecision: Annotation<AgentDecision | null>({
        reducer: (_x: AgentDecision | null, y: AgentDecision | null) => (y !== undefined ? y : null),
        default: () => null
    }),
    currentQuestionFollowUpCount: Annotation<number>(keep<number>(0)),
    previousCallContext: Annotation<string>(keep<string>("")),
});

export type HealthCheckStateType = typeof HealthCheckState.State;
