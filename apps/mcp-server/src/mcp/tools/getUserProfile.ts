import { z } from 'zod';
import { UserRepository } from '@naiber/shared-data';

export const getUserProfileSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

export async function getUserProfileHandler(args: { userId: string }) {
    const profile = await UserRepository.findById(args.userId);
    if (!profile) {
        throw new Error(`User not found: ${args.userId}`);
    }

    return {
        id: profile.id,
        name: profile.name,
        age: profile.age ?? null,
        gender: profile.gender ?? null,
        interests: profile.interests,
        dislikes: profile.dislikes,
        hasWebAccess: profile.hasWebAccess,
        emergencyContact: profile.emergencyContact
            ? {
                name: profile.emergencyContact.name,
                relationship: profile.emergencyContact.relationship,
                phone: profile.emergencyContact.phone,
            }
            : null,
        healthConditions: profile.healthConditions
            .filter(c => c.isActive)
            .map(c => ({ condition: c.condition, severity: c.severity, notes: c.notes })),
        medications: profile.medications
            .filter(m => m.isActive)
            .map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, notes: m.notes })),
        recentTopics: profile.conversationTopics.map(t => ({
            name: t.topicName,
            category: t.category,
            lastSummary: t.conversationReferences[0]?.conversationSummary?.summaryText ?? null,
        })),
        recentSummaries: profile.conversationSummaries.map(s => s.summaryText),
    };
}
