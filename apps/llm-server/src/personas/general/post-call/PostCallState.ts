import { Annotation } from "@langchain/langgraph";
import { ReturnedTopic } from "../ConversationHandler.js";

export const PostCallState = Annotation.Root({
    conversationId: Annotation<string>(),
    userId: Annotation<string>(),
    transcript: Annotation<string>(),

    isFirstCall: Annotation<boolean>({
        value: (x: boolean, y: boolean) => y ?? x ?? false,
        default: () => false
    }),

    summaryId: Annotation<string | null>({
        value: (x: string | null, y: string | null) => y ?? x ?? null,
        default: () => null
    }),

    callLogId: Annotation<string | null>({
        value: (x: string | null, y: string | null) => y ?? x ?? null,
        default: () => null
    }),

    summary: Annotation<{
        summaryText: string;
        topicsDiscussed: string[];
        keyHighlights: Array<{ text: string; importanceScore: number }>;
    } | null>({
        value: (x: {
            summaryText: string;
            topicsDiscussed: string[];
            keyHighlights: Array<{ text: string; importanceScore: number }>;
        } | null, y: {
            summaryText: string;
            topicsDiscussed: string[];
            keyHighlights: Array<{ text: string; importanceScore: number }>;
        } | null) => y ?? x ?? null,
        default: () => null
    }),

    newTopics: Annotation<string[]>({
        value: (x: string[], y: string[]) => y ?? x ?? [],
        default: () => []
    }),

    existingTopics: Annotation<ReturnedTopic[]>({
        value: (x: ReturnedTopic[], y: ReturnedTopic[]) => y ?? x ?? [],
        default: () => []
    }),

    topicsToCreate: Annotation<string[]>({
        value: (x: string[], y: string[]) => y ?? x ?? [],
        default: () => []
    }),

    topicsToUpdate: Annotation<Array<{
        oldName: string;
        newName: string;
        topicId: string;
        existingEmbedding: number[];
        newEmbedding: number[];
    }>>({
        value: (x: Array<{
            oldName: string;
            newName: string;
            topicId: string;
            existingEmbedding: number[];
            newEmbedding: number[];
        }>, y: Array<{
            oldName: string;
            newName: string;
            topicId: string;
            existingEmbedding: number[];
            newEmbedding: number[];
        }>) => y ?? x ?? [],
        default: () => []
    }),

    topicMatchResults: Annotation<Array<{
        topic: string;
        matchedExisting: boolean;
        existingTopicId?: string;
        similarity?: number;
    }>>({
        value: (x: Array<{
            topic: string;
            matchedExisting: boolean;
            existingTopicId?: string;
            similarity?: number;
        }>, y: Array<{
            topic: string;
            matchedExisting: boolean;
            existingTopicId?: string;
            similarity?: number;
        }>) => y ?? x ?? [],
        default: () => []
    }),

    callType: Annotation<'general' | 'health_check'>({
        value: (x: 'general' | 'health_check', y: 'general' | 'health_check') => y ?? x ?? 'general',
        default: () => 'general'
    }),

    highlightEntries: Annotation<Array<{
        text: string;
        qdrantPointId: string;
        embedding: number[];
        importanceScore: number;
    }>>({
        value: (x: Array<{
            text: string;
            qdrantPointId: string;
            embedding: number[];
            importanceScore: number;
        }>, y: Array<{
            text: string;
            qdrantPointId: string;
            embedding: number[];
            importanceScore: number;
        }>) => y ?? x ?? [],
        default: () => []
    }),

    extractedPersons: Annotation<Array<{
        id: string;
        name: string;
        role?: string;
        context: string;
        highlightIndices: number[];
    }>>({
        value: (x: Array<{
            id: string;
            name: string;
            role?: string;
            context: string;
            highlightIndices: number[];
        }>, y: Array<{
            id: string;
            name: string;
            role?: string;
            context: string;
            highlightIndices: number[];
        }>) => y ?? x ?? [],
        default: () => []
    }),

    callDurationMinutes: Annotation<number | null>({
        value: (x: number | null, y: number | null) => y ?? x ?? null,
        default: () => null
    }),

    callDate: Annotation<string>({
        value: (x: string, y: string) => y ?? x ?? '',
        default: () => ''
    }),

    errors: Annotation<string[]>({
        reducer: (x: string[], y: string[]) => x.concat(y),
        default: () => []
    }),

    completed: Annotation<boolean>({
        value: (x: boolean, y: boolean) => y ?? x ?? false,
        default: () => false
    })
});

export type PostCallStateType = typeof PostCallState.State;
