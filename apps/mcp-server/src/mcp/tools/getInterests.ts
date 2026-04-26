import { z } from 'zod';
import { ConversationRepository } from '@naiber/shared-data';

export const getInterestsSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

export async function getInterestsHandler(args: { userId: string }) {
    const topics = await ConversationRepository.findTopicsWithMentionCount(args.userId);

    return topics.map(t => ({
        id: t.id,
        topicName: t.topicName,
        category: t.category ?? null,
        mentionCount: t._count.conversationReferences,
        lastUpdated: t.updatedAt,
    }));
}
