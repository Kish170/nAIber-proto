import { z } from 'zod';
import { UserRepository } from '@naiber/shared-data';

export const getUserInterestsSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

export async function getUserInterestsHandler(args: { userId: string }) {
    const profile = await UserRepository.findById(args.userId);
    if (!profile) {
        throw new Error(`User not found: ${args.userId}`);
    }

    return {
        interests: profile.interests,
        dislikes: profile.dislikes,
        recentTopics: profile.conversationTopics.map(t => ({
            name: t.topicName,
            category: t.category ?? null,
            lastSummary: t.conversationReferences[0]?.conversationSummary?.summaryText ?? null,
        })),
    };
}
