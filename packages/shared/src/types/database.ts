import { Prisma } from '../../../../generated/prisma/index.js';

export const userProfileInclude = Prisma.validator<Prisma.UserInclude>()({
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
            lastMentioned: true,
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
        orderBy: { lastMentioned: 'desc' },
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

export type UserProfileData = Prisma.UserGetPayload<{
    include: typeof userProfileInclude
}>;


export type EmergencyContact = NonNullable<UserProfileData['emergencyContact']>;
export type HealthCondition = UserProfileData['healthConditions'][number];
export type Medication = UserProfileData['medications'][number];
export type ConversationTopic = UserProfileData['conversationTopics'][number];
export type ConversationSummary = UserProfileData['conversationSummaries'][number];
export type ConversationSummaryReferenceForTopic = ConversationTopic['conversationReferences'][number];


export type BasicInfo = Pick<UserProfileData, 'name' | 'age' | 'gender' | 'interests' | 'dislikes'>;
