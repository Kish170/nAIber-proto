import { z } from 'zod';
import { ConversationRepository } from '@naiber/shared-data';

export const getConversationTopicsSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

export async function getConversationTopicsHandler(args: { userId: string }) {
    const topics = await ConversationRepository.findTopicsByElderlyProfileId(args.userId);

    return topics.map(t => ({
        id: t.id,
        topicName: t.topicName,
    }));
}
