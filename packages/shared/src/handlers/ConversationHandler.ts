import { prismaClient } from '../clients/PrismaDBClient.js';

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
}

export interface ConversationTopicData {
    userId: string;
    topicName: string;
    category?: string;
}

export interface ConversationReferenceData {
    conversationSummaryId: string;
    conversationTopicId: string;
}

export async function createSummary( data: Summary) {
   try {
        await prismaClient.conversationSummary.create({
            data: {
                userId: data.userId,
                conversationId: data.conversationId,
                summaryText: data.summaryText,
                topicsDiscussed: [...data.topicsDiscussed],
                keyHighlights: [...data.keyHighlights]
            }
        });
   } catch (error) {
        console.error("[Conversation Handler] Unable to create conversation summary")
        throw error;
   } 
}

export async function createLog(data: CallLogData) {
    try {
        const callLog = await prismaClient.callLog.create({
            data: {
                userId: data.userId,
                scheduledTime: data.scheduledTime,
                endTime: data.endTime,
                status: data.status || 'PENDING',
                outcome: data.outcome,
                twilioCallSid: data.twilioCallSid,
                elevenlabsConversationId: data.elevenlabsConversationId
            }
        });
        return callLog;
    } catch (error) {
        console.error("[Conversation Handler] Unable to create call log:", error);
        throw error;
    }
}

export async function createConversationTopics(data: ConversationTopicData) {
    try {
        const topic = await prismaClient.conversationTopic.upsert({
            where: {
                userId_topicName: {
                    userId: data.userId,
                    topicName: data.topicName
                }
            },
            update: {
                lastMentioned: new Date(),
                category: data.category || undefined
            },
            create: {
                userId: data.userId,
                topicName: data.topicName,
                category: data.category,
                firstMentioned: new Date(),
                lastMentioned: new Date()
            }
        });
        return topic;
    } catch (error) {
        console.error("[Conversation Handler] Unable to create/update conversation topic:", error);
        throw error;
    }
}

export async function createConversationReferences(data: ConversationReferenceData) {
    try {
        const reference = await prismaClient.conversationTopicReference.upsert({
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
        return reference;
    } catch (error) {
        console.error("[Conversation Handler] Unable to create conversation reference:", error);
        throw error;
    }
}

// need to update for proper implementation
export async function updateConversationTopics(userId: string, topicName: string) {
    try {
        const topic = await prismaClient.conversationTopic.update({
            where: {
                userId_topicName: {
                    userId,
                    topicName
                }
            },
            data: {
                lastMentioned: new Date()
            }
        });
        return topic;
    } catch (error) {
        console.error("[Conversation Handler] Unable to update conversation topic:", error);
        throw error;
    }
}

// need to update for proper implementation
export async function updateConversationReferences(conversationSummaryId: string, conversationTopicId: string) {
    try {
        const reference = await prismaClient.conversationTopicReference.update({
            where: {
                conversationSummaryId_conversationTopicId: {
                    conversationSummaryId,
                    conversationTopicId
                }
            },
            data: {
                mentionedAt: new Date()
            }
        });
        return reference;
    } catch (error) {
        console.error("[Conversation Handler] Unable to update conversation reference:", error);
        throw error;
    }
}
