import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const ConversationState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => []
    }),
    userId: Annotation<string>(),
    conversationId: Annotation<string>(),

    shouldProcessRAG: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),
    messageLength: Annotation<number>(),
    hasSubstantiveContent: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),
    isContinuation: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),
    isShortResponse: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),

    currentTopicVector: Annotation<number[] | null>({
        value: (x, y) => y ?? x ?? null,
        default: () => null
    }),

    messageCount: Annotation<number>({
        value: (x, y) => y ?? x ?? 0,
        default: () => 0
    }),

    topicFatigue: Annotation<number>({
        value: (x, y) => y ?? x ?? 0.0,
        default: () => 0.0
    }),

    topicChanged: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),

    retrievedMemories: Annotation<string[]>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
    }),

    fatigueGuidance: Annotation<string>({
        value: (x, y) => y ?? x ?? "",
        default: () => ""
    }),
    response: Annotation<string>(),

    isEndCall: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),

    isHealthCheckComplete: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),

    currentQuestionIndex: Annotation<number>({
        value: (x, y) => y ?? x ?? 0,
        default: () => 0
    }),

    healthQuestions: Annotation<string[]>({
        value: (x, y) => y ?? x ?? [
            "On a scale of 1–10, how are you feeling overall right now?",
            "Are you experiencing any physical symptoms at the moment?",
            "Have you taken your prescribed medications today?",
            "How would you rate your sleep last night from 1–10?",
            "Is there anything else you'd like to note about how you're feeling?"
        ],
        default: () => [
            "On a scale of 1–10, how are you feeling overall right now?",
            "Are you experiencing any physical symptoms at the moment?",
            "Have you taken your prescribed medications today?",
            "How would you rate your sleep last night from 1–10?",
            "Is there anything else you'd like to note about how you're feeling?"
        ]
    }),

    healthAnswer: Annotation<string[]>({
        reducer: (x, y) => x.concat(y),
        default: () => []
    })

});

export type ConversationStateType = typeof ConversationState.State;