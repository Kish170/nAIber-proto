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

    topicChanged: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),

    retrievedMemories: Annotation<string[]>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
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
});

export type ConversationStateType = typeof ConversationState.State;
