import { Annotation } from "@langchain/langgraph";
import { ReturnedTopic } from "../../../shared/src/handlers/ConversationHandler.js";

export const PostCallState = Annotation.Root({
    conversationId: Annotation<string>(),
    userId: Annotation<string>(),
    transcript: Annotation<string>(),

    summary: Annotation<{
        summaryText: string;
        topicsDiscussed: string[];
        keyHighlights: string[];
    } | null>({
        value: (x, y) => y ?? x ?? null,
        default: () => null
    }),

    newTopics: Annotation<string[]>({ 
        value: (x, y) => y ?? x ?? [], 
        default: () => [] 
    }),

    existingTopics: Annotation<ReturnedTopic[]>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
    }),

    topicsToCreate: Annotation<string[]>({ 
        value: (x, y) => y ?? x ?? [], 
        default: () => [] 
    }),

    topicsToUpdate: Annotation<string[]>({ 
        value: (x, y) => y ?? x ?? [], 
        default: () => [] 
    }),

    completed: Annotation<boolean>({ 
        value: (x, y) => y ?? x ?? false, 
        default: () => false 
    })
});