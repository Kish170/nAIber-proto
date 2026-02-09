import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { QuestionData } from "../handlers/questions/index.js";

export interface HealthCheckAnswer {
    questionIndex: number;
    question: QuestionData;
    rawAnswer: string;
    validatedAnswer: string;
    isValid: boolean;
    attemptCount: number;
}

export const HealthCheckState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => []
    }),
    userId: Annotation<string>(),
    conversationId: Annotation<string>(),

    healthCheckQuestions: Annotation<QuestionData[]>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
    }),
    currentQuestionIndex: Annotation<number>({
        value: (x, y) => y ?? x ?? 0,
        default: () => 0
    }),
    questionAttempts: Annotation<number>({
        value: (x, y) => y ?? x ?? 0,
        default: () => 0
    }),

    healthCheckAnswers: Annotation<HealthCheckAnswer[]>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
    }),

    rawAnswer: Annotation<string>({
        value: (x, y) => y ?? x ?? "",
        default: () => ""
    }),
    validatedAnswer: Annotation<string>({
        value: (x, y) => y ?? x ?? "",
        default: () => ""
    }),
    isValid: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),

    isHealthCheckComplete: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),

    response: Annotation<string>({
        value: (x, y) => y ?? x ?? "",
        default: () => ""
    }),
});

export type HealthCheckStateType = typeof HealthCheckState.State;
