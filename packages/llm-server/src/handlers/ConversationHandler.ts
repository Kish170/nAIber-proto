import { ConversationRepository } from "@naiber/shared";

export interface Summary {
    userId: string;
    conversationId: string;
    summaryText: string;
    topicsDiscussed: string[];
    keyHighlights: string[];
}

export interface CallLogData {
    userId: string;
    scheduledTime: Date;
    endTime?: Date;
    status?: 'PENDING' | 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    outcome?: 'COMPLETED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'USER_ENDED_EARLY';
    twilioCallSid?: string;
    elevenlabsConversationId?: string;
    checkInCompleted: boolean;
}

export interface ConversationTopicData {
    userId: string;
    topicName: string;
    category?: string;
    topicEmbedding: number[];
}

export interface ConversationReferenceData {
    conversationSummaryId: string;
    conversationTopicId: string;
}

export interface ReturnedTopic {
    id: string;
    topicName: string;
    topicEmbedding: number[];
}

export async function createSummary(data: Summary) {
    return await ConversationRepository.upsertSummary(data);
}

export async function createLog(data: CallLogData) {
    return await ConversationRepository.createCallLog(data);
}

export async function createConversationTopic(data: ConversationTopicData): Promise<ReturnedTopic> {
    return await ConversationRepository.upsertTopic(data);
}

export async function createConversationReferences(data: ConversationReferenceData) {
    return await ConversationRepository.upsertTopicReference(data);
}

export async function updateConversationTopic(userId: string, oldTopicName: string, newTopicName: string): Promise<ReturnedTopic> {
    const existingNewTopic = await ConversationRepository.findTopicByName(userId, newTopicName);

    if (existingNewTopic) {
        console.log(`[ConversationHandler] Topic "${newTopicName}" already exists, adding "${oldTopicName}" as variation`);
        return await ConversationRepository.addVariationToTopic(userId, newTopicName, oldTopicName);
    }

    return await ConversationRepository.renameTopic(userId, oldTopicName, newTopicName);
}

export async function updateConversationReference(conversationSummaryId: string, conversationTopicId: string) {
    const reference = await ConversationRepository.findTopicReferenceBySummaryId(conversationSummaryId);

    if (!reference) {
        throw new Error('[ConversationHandler] Reference not found');
    }

    return await ConversationRepository.updateTopicReferenceById(reference.id, conversationTopicId);
}

export async function getConversationTopics(userId: string) {
    return await ConversationRepository.findTopicsByUserId(userId);
}

export async function getConversationTopic(userId: string, topicId: string) {
    return await ConversationRepository.findTopicById(userId, topicId);
}

export async function getTopicReference(topicId: string) {
    return await ConversationRepository.findTopicReferenceById(topicId);
}
