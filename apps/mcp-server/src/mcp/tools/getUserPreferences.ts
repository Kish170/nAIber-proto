import { z } from 'zod';
import { UserRepository } from '@naiber/shared-data';

export const getUserPreferencesSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

export async function getUserPreferencesHandler(args: { userId: string }) {
    const profile = await UserRepository.findById(args.userId);
    if (!profile) {
        throw new Error(`User not found: ${args.userId}`);
    }

    return {
        callFrequency: profile.callFrequency,
        preferredCallTime: profile.preferredCallTime,
        hasWebAccess: profile.hasWebAccess,
        gender: profile.gender ?? null,
        enableHealthCheckIns: profile.enableHealthCheckIns,
    };
}
