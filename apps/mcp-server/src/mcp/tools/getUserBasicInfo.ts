import { z } from 'zod';
import { UserRepository } from '@naiber/shared-data';

export const getUserBasicInfoSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

export async function getUserBasicInfoHandler(args: { userId: string }) {
    const profile = await UserRepository.findById(args.userId);
    if (!profile) {
        throw new Error(`User not found: ${args.userId}`);
    }

    return {
        id: profile.id,
        name: profile.name,
        age: profile.age ?? null,
        phone: profile.phone,
        gender: profile.gender ?? null,
    };
}
