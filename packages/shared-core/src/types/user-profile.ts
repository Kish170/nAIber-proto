import { Prisma } from '../../../../generated/prisma/index.js';

export const elderlyProfileInclude = Prisma.validator<Prisma.ElderlyProfileInclude>()({
    emergencyContact: {
        select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            relationship: true,
            smsEnabled: true,
            notifyOnMissedCalls: true,
        }
    },
    healthConditions: {
        select: {
            id: true,
            condition: true,
            severity: true,
            isActive: true,
            notes: true,
        }
    },
    medications: {
        select: {
            id: true,
            name: true,
            dosage: true,
            frequency: true,
            isActive: true,
            notes: true,
        }
    },
    conversationTopics: {
        select: {
            id: true,
            topicName: true,
            category: true,
            conversationReferences: {
                select: {
                    conversationSummary: {
                        select: {
                            summaryText: true
                        }
                    }
                },
                orderBy: {
                    mentionedAt: 'desc'
                },
                take: 1
            }
        },
        orderBy: { updatedAt: 'desc' },
        take: 5
    },
    conversationSummaries: {
        select: {
            id: true,
            summaryText: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5
    },
});

export type ElderlyProfileData = Prisma.ElderlyProfileGetPayload<{
    include: typeof elderlyProfileInclude
}>;

export type EmergencyContact = NonNullable<ElderlyProfileData['emergencyContact']>;
export type HealthCondition = ElderlyProfileData['healthConditions'][number];
export type Medication = ElderlyProfileData['medications'][number];
export type ConversationTopic = ElderlyProfileData['conversationTopics'][number];
export type ConversationSummary = ElderlyProfileData['conversationSummaries'][number];
export type ConversationSummaryReferenceForTopic = ConversationTopic['conversationReferences'][number];

export type BasicInfo = Pick<ElderlyProfileData, 'name' | 'age' | 'gender' | 'interests' | 'dislikes'>;