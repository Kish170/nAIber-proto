import { ConversationRepository } from "@naiber/shared-data";

export interface Summary {
    elderlyProfileId: string;
    conversationId: string;
    summaryText: string;
    topicsDiscussed: string[];
    keyHighlights: string[];
}

export interface CallLogData {
    elderlyProfileId: string;
    scheduledTime: Date;
    endTime?: Date;
    status?: 'PENDING' | 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    outcome?: 'COMPLETED' | 'NO_ANSWER' | 'BUSY' | 'FAILED' | 'USER_ENDED_EARLY';
    twilioCallSid?: string;
    elevenlabsConversationId?: string;
    checkInCompleted: boolean;
}

export interface ConversationTopicData {
    elderlyProfileId: string;
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

export async function updateConversationTopic(elderlyProfileId: string, oldTopicName: string, newTopicName: string): Promise<ReturnedTopic> {
    const existingNewTopic = await ConversationRepository.findTopicByName(elderlyProfileId, newTopicName);

    if (existingNewTopic) {
        console.log(`[ConversationHandler] Topic "${newTopicName}" already exists, adding "${oldTopicName}" as variation`);
        return await ConversationRepository.addVariationToTopic(elderlyProfileId, newTopicName, oldTopicName);
    }

    return await ConversationRepository.renameTopic(elderlyProfileId, oldTopicName, newTopicName);
}

export async function updateConversationReference(conversationSummaryId: string, conversationTopicId: string) {
    const reference = await ConversationRepository.findTopicReferenceBySummaryId(conversationSummaryId);

    if (!reference) {
        throw new Error('[ConversationHandler] Reference not found');
    }

    return await ConversationRepository.updateTopicReferenceById(reference.id, conversationTopicId);
}

export async function getConversationTopics(elderlyProfileId: string) {
    return await ConversationRepository.findTopicsByElderlyProfileId(elderlyProfileId);
}

export async function getConversationTopic(elderlyProfileId: string, topicId: string) {
    return await ConversationRepository.findTopicById(elderlyProfileId, topicId);
}

export async function getTopicReference(topicId: string) {
    return await ConversationRepository.findTopicReferenceById(topicId);
}
