import { prismaClient } from '@naiber/shared-clients';
import type { ContactFrequency, ReliabilityTier, SubmissionType } from '../../../../generated/prisma/index.js';

export interface TrustedContactData {
    elderlyProfileId: string;
    name: string;
    relationship: string;
    knownDurationYears: number;
    contactFrequency: ContactFrequency;
    reliabilityTier: ReliabilityTier;
}

export interface TrustedContactSubmissionData {
    trustedContactId: string;
    submissionType: SubmissionType;
    structuredResponses: object;
    openTextResponses?: object;
    referencePointNote?: string;
    rawScore: number;
    informantConcernIndex: number;
}

export class TrustedContactRepository {
    static async createTrustedContact(data: TrustedContactData) {
        try {
            return await prismaClient.trustedContact.create({ data });
        } catch (error) {
            console.error('[TrustedContactRepository] Unable to create trusted contact:', error);
            throw error;
        }
    }

    static async findByElderlyProfileId(elderlyProfileId: string) {
        try {
            return await prismaClient.trustedContact.findMany({
                where: { elderlyProfileId },
                include: { submissions: { orderBy: { createdAt: 'desc' }, take: 1 } },
            });
        } catch (error) {
            console.error('[TrustedContactRepository] Unable to find trusted contacts:', error);
            throw error;
        }
    }

    static async createSubmission(data: TrustedContactSubmissionData) {
        try {
            return await prismaClient.trustedContactSubmission.create({ data });
        } catch (error) {
            console.error('[TrustedContactRepository] Unable to create submission:', error);
            throw error;
        }
    }

    static async getLatestSubmission(trustedContactId: string) {
        try {
            return await prismaClient.trustedContactSubmission.findFirst({
                where: { trustedContactId },
                orderBy: { createdAt: 'desc' },
            });
        } catch (error) {
            console.error('[TrustedContactRepository] Unable to get latest submission:', error);
            throw error;
        }
    }

    static async getSubmissionHistory(trustedContactId: string) {
        try {
            return await prismaClient.trustedContactSubmission.findMany({
                where: { trustedContactId },
                orderBy: { createdAt: 'desc' },
            });
        } catch (error) {
            console.error('[TrustedContactRepository] Unable to get submission history:', error);
            throw error;
        }
    }

    static async updateConcernIndex(trustedContactId: string, index: number, weightedIndex: number) {
        try {
            return await prismaClient.trustedContact.update({
                where: { id: trustedContactId },
                data: {
                    informantConcernIndex: index,
                    weightedInformantIndex: weightedIndex,
                },
            });
        } catch (error) {
            console.error('[TrustedContactRepository] Unable to update concern index:', error);
            throw error;
        }
    }

    static async findPrimaryContact(elderlyProfileId: string) {
        try {
            const contacts = await prismaClient.trustedContact.findMany({
                where: { elderlyProfileId, isPrimary: true },
            });
            if (contacts.length > 1) {
                throw new Error(
                    `[TrustedContactRepository] Data integrity error: ${contacts.length} contacts with isPrimary=true for elder ${elderlyProfileId}. Expected exactly one.`,
                );
            }
            return contacts[0] ?? null;
        } catch (error) {
            console.error('[TrustedContactRepository] Unable to find primary contact:', error);
            throw error;
        }
    }
    
    static async updatePrimaryConcernIndex(
        elderlyProfileId: string,
        index: number,
        weightedIndex: number,
    ) {
        const primary = await TrustedContactRepository.findPrimaryContact(elderlyProfileId);
        if (!primary) {
            console.warn(
                `[TrustedContactRepository] No isPrimary contact for elder ${elderlyProfileId} — updatePrimaryConcernIndex no-op`,
            );
            return null;
        }
        return TrustedContactRepository.updateConcernIndex(primary.id, index, weightedIndex);
    }
}
