import { Annotation } from "@langchain/langgraph";
import { ReturnedTopic } from "../ConversationHandler.js";

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
        existingEmbedding: number[];
        newEmbedding: number[];
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

    callType: Annotation<'general' | 'health_check'>({
        value: (x, y) => y ?? x ?? 'general',
        default: () => 'general'
    }),

    highlightEntries: Annotation<Array<{
        text: string;
        qdrantPointId: string;
        embedding: number[];
    }>>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
    }),

    extractedPersons: Annotation<Array<{
        id: string;
        name: string;
        role?: string;
        context: string;
        highlightIndices: number[];
    }>>({
        value: (x, y) => y ?? x ?? [],
        default: () => []
    }),

    callDurationMinutes: Annotation<number | null>({
        value: (x, y) => y ?? x ?? null,
        default: () => null
    }),

    callDate: Annotation<string>({
        value: (x, y) => y ?? x ?? '',
        default: () => ''
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