import { z } from 'zod';
import { UserRepository } from '@naiber/shared-data';

export const getUserMedicalContextSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

export async function getUserMedicalContextHandler(args: { userId: string }) {
    const profile = await UserRepository.findById(args.userId);
    if (!profile) {
        throw new Error(`User not found: ${args.userId}`);
    }

    return {
        healthConditions: profile.healthConditions
            .filter(c => c.isActive)
            .map(c => ({ condition: c.condition, severity: c.severity ?? null, notes: c.notes ?? null })),
        medications: profile.medications
            .filter(m => m.isActive)
            .map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, notes: m.notes ?? null })),
    };
}
