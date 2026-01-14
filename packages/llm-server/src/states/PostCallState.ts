import { Annotation } from "@langchain/langgraph";
import { ReturnedTopic } from "../../../shared/src/handlers/ConversationHandler.js";

export const PostCallState = Annotation.Root({
    conversationId: Annotation<string>(),
    userId: Annotation<string>(),
    transcript: Annotation<string>(),

    isFirstCall: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    }),

    summaryId: Annotation<string | null>({
        value: (x, y) => y ?? x ?? null,
        default: () => null
    }),

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

    topicsToUpdate: Annotation<Array<{
        oldName: string;
        newName: string;
        topicId: string;
    }>>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
    }),

    topicMatchResults: Annotation<Array<{
        topic: string;
        matchedExisting: boolean;
        existingTopicId?: string;
        similarity?: number;
    }>>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
    }),

    errors: Annotation<string[]>({
        reducer: (x, y) => x.concat(y),
        default: () => []
    }),

    completed: Annotation<boolean>({
        value: (x, y) => y ?? x ?? false,
        default: () => false
    })
});

export type PostCallStateType = typeof PostCallState.State;