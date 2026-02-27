import { prismaClient } from '../clients/PrismaDBClient.js';

const MAX_TOPIC_VARIATIONS = 10;

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

export class ConversationRepository {

    static async upsertSummary(data: Summary) {
        try {
            return await prismaClient.conversationSummary.upsert({
                where: {
                    conversationId: data.conversationId
                },
                update: {
                    summaryText: data.summaryText,
                    topicsDiscussed: [...data.topicsDiscussed],
                    keyHighlights: [...data.keyHighlights]
                },
                create: {
                    userId: data.userId,
                    conversationId: data.conversationId,
                    summaryText: data.summaryText,
                    topicsDiscussed: [...data.topicsDiscussed],
                    keyHighlights: [...data.keyHighlights]
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to upsert conversation summary:', error);
            throw error;
        }
    }

    static async createCallLog(data: CallLogData) {
        try {
            return await prismaClient.callLog.create({
                data: {
                    userId: data.userId,
                    scheduledTime: data.scheduledTime,
                    endTime: data.endTime,
                    status: data.status || 'PENDING',
                    outcome: data.outcome,
                    twilioCallSid: data.twilioCallSid,
                    elevenlabsConversationId: data.elevenlabsConversationId,
                    checkInCompleted: data.checkInCompleted
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to create call log:', error);
            throw error;
        }
    }

    static async upsertTopic(data: ConversationTopicData) {
        try {
            return await prismaClient.conversationTopic.upsert({
                where: {
                    userId_topicName: {
                        userId: data.userId,
                        topicName: data.topicName
                    }
                },
                update: {
                    topicEmbedding: data.topicEmbedding,
                    category: data.category,
                },
                create: {
                    userId: data.userId,
                    topicName: data.topicName,
                    category: data.category,
                    topicEmbedding: data.topicEmbedding,
                    variations: [],
                },
                select: {
                    id: true,
                    topicName: true,
                    topicEmbedding: true
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to upsert conversation topic:', error);
            throw error;
        }
    }

    static async upsertTopicReference(data: ConversationReferenceData) {
        try {
            return await prismaClient.conversationTopicReference.upsert({
                where: {
                    conversationSummaryId_conversationTopicId: {
                        conversationSummaryId: data.conversationSummaryId,
                        conversationTopicId: data.conversationTopicId
                    }
                },
                update: {
                    mentionedAt: new Date()
                },
                create: {
                    conversationSummaryId: data.conversationSummaryId,
                    conversationTopicId: data.conversationTopicId,
                    mentionedAt: new Date()
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to upsert conversation reference:', error);
            throw error;
        }
    }

    static async findTopicByName(userId: string, topicName: string) {
        try {
            return await prismaClient.conversationTopic.findUnique({
                where: {
                    userId_topicName: {
                        userId,
                        topicName
                    }
                },
                select: {
                    id: true,
                    topicName: true,
                    topicEmbedding: true,
                    variations: true
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to find topic by name:', error);
            throw error;
        }
    }

    static async addVariationToTopic(userId: string, topicName: string, variation: string) {
        try {
            const current = await prismaClient.conversationTopic.findUnique({
                where: { userId_topicName: { userId, topicName } },
                select: { variations: true }
            });
            const updatedVariations = [variation, ...(current?.variations ?? [])].slice(0, MAX_TOPIC_VARIATIONS);

            return await prismaClient.conversationTopic.update({
                where: {
                    userId_topicName: { userId, topicName }
                },
                data: { variations: updatedVariations },
                select: {
                    id: true,
                    topicName: true,
                    topicEmbedding: true
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to add variation to topic:', error);
            throw error;
        }
    }

    static async renameTopic(userId: string, oldTopicName: string, newTopicName: string) {
        try {
            const current = await prismaClient.conversationTopic.findUnique({
                where: { userId_topicName: { userId, topicName: oldTopicName } },
                select: { variations: true }
            });
            const updatedVariations = [oldTopicName, ...(current?.variations ?? [])].slice(0, MAX_TOPIC_VARIATIONS);

            return await prismaClient.conversationTopic.update({
                where: {
                    userId_topicName: { userId, topicName: oldTopicName }
                },
                data: {
                    topicName: newTopicName,
                    variations: updatedVariations
                },
                select: {
                    id: true,
                    topicName: true,
                    topicEmbedding: true
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to rename topic:', error);
            throw error;
        }
    }

    static async findTopicReferenceBySummaryId(conversationSummaryId: string) {
        try {
            return await prismaClient.conversationTopicReference.findFirst({
                where: {
                    conversationSummaryId
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to find topic reference:', error);
            throw error;
        }
    }

    static async updateTopicReferenceById(referenceId: string, conversationTopicId: string) {
        try {
            return await prismaClient.conversationTopicReference.update({
                where: {
                    id: referenceId
                },
                data: {
                    conversationTopicId
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to update topic reference:', error);
            throw error;
        }
    }

    static async findTopicsByUserId(userId: string) {
        try {
            return await prismaClient.conversationTopic.findMany({
                where: {
                    userId
                },
                select: {
                    id: true,
                    topicName: true,
                    topicEmbedding: true
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to get conversation topics:', error);
            throw error;
        }
    }

    static async findTopicById(userId: string, topicId: string) {
        try {
            return await prismaClient.conversationTopic.findUnique({
                where: {
                    userId,
                    id: topicId
                },
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to get conversation topic:', error);
            throw error;
        }
    }

    static async findTopicReferenceById(topicId: string) {
        try {
            return await prismaClient.conversationTopicReference.findUnique({
                where: {
                    id: topicId
                }
            });
        } catch (error) {
            console.error('[ConversationRepository] Unable to get topic reference:', error);
            throw error;
        }
    }
}