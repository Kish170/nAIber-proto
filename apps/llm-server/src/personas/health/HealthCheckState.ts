import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { QuestionData } from "./questions/index.js";

export interface HealthCheckAnswer {
    questionIndex: number;
    question: QuestionData;
    rawAnswer: string;
    validatedAnswer: string;
    isValid: boolean;
    attemptCount: number;
}

const keep = <T>(fallback: T) => ({
    reducer: (x: T, y: T | undefined | null) => (y !== undefined && y !== null) ? y : (x !== undefined && x !== null ? x : fallback),
    default: () => fallback
});

export const HealthCheckState = Annotation.Root({
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
});

export type HealthCheckStateType = typeof HealthCheckState.State;