import { z } from 'zod';
import { TrustedContactRepository } from '@naiber/shared-data';

export const getRelationshipContextSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
};

export async function getRelationshipContextHandler(args: { userId: string }) {
    const contacts = await TrustedContactRepository.findByElderlyProfileId(args.userId);

    return contacts.map(c => ({
        name: c.name,
        relationship: c.relationship,
        knownDurationYears: c.knownDurationYears,
        contactFrequency: c.contactFrequency,
        reliabilityTier: c.reliabilityTier,
    }));
}
