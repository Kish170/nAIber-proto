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

export async function createConversationTopic(data: ConversationTopicData): Promise<ReturnedTopic>{
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
            }
        });
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

export async function updateConversationTopic(userId: string, topicName: string, newTopic: string): Promise<ReturnedTopic> {
    try {
        const existingNewTopic = await prismaClient.conversationTopic.findUnique({
            where: {
                userId_topicName: {
                    userId,
                    topicName: newTopic
                }
            },
            select: {
                id: true,
                topicName: true,
                topicEmbedding: true,
                variations: true
            }
        });

        if (existingNewTopic) {
            console.log(`[Conversation Handler] Topic "${newTopic}" already exists, adding "${topicName}" as variation`);
            return await prismaClient.conversationTopic.update({
                where: {
                    userId_topicName: {
                        userId,
                        topicName: newTopic
                    }
                },
                data: {
                    variations: {
                        push: topicName
                    }
                },
                select: {
                    id: true,
                    topicName: true,
                    topicEmbedding: true
                }
            });
        }

        // Otherwise, rename the old topic to the new name
        return await prismaClient.conversationTopic.update({
            where: {
                userId_topicName: {
                    userId,
                    topicName
                }
            },
            data: {
                topicName: newTopic,
                variations: {
                    push: topicName
                }
            },
            select: {
                id: true,
                topicName: true,
                topicEmbedding: true
            }
        });
    } catch (error) {
        console.error("[Conversation Handler] Unable to update conversation topic:", error);
        throw error;
    }
}

export async function updateConversationReference(conversationSummaryId: string, conversationTopicId: string) {
    try {
        const reference = await prismaClient.conversationTopicReference.findFirst({
            where: {
                conversationSummaryId
            }
        });

        if (!reference) {
            throw new Error("Reference not found");
        }

        const updated = await prismaClient.conversationTopicReference.update({
            where: {
                id: reference.id
            },
            data: {
                conversationTopicId
            }
        });
        
        return updated;
    } catch (error) {
        console.error("[Conversation Handler] Unable to update conversation reference:", error);
        throw error;
    }
}

export async function getConversationTopics(userId: string) {
    try {
        const allTopics = await prismaClient.conversationTopic.findMany( {
            where: {
                userId
            },
            select: {
                id: true,
                topicName: true,
                topicEmbedding: true
            }
        });
        return allTopics;
    } catch (error) {
        console.error("[Conversation Handler] Unable to get all conversations topics", error);
        throw error;
    }
}

export async function getConversationTopic(userId: string, topicId: string) {
    try {
        const topic = await prismaClient.conversationTopic.findUnique( {
            where: {
                userId,
                id: topicId 
            },
        });
        return topic;
    } catch (error) {
        console.error("[Conversation Handler] Unable to get all conversations topics", error);
        throw error;
    }
}

export async function getTopicReference(topicId: string) {
    try {
        const topicReference = await prismaClient.conversationTopicReference.findUnique( {
            where: {
                id: topicId 
            }
        })
        return topicReference;
    } catch (error) {
        console.error("[Conversation Handler] Unable to get all conversations topics", error);
        throw error;
    }
}

