import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";

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

    currentTopicVector: Annotation<number[] | null>({
        value: (x, y) => y ?? x ?? null,
        default: () => null
    }),

    messageCount: Annotation<number>({
        reducer: (x, y) => y, 
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
    response: Annotation<string>()
});