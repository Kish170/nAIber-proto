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
}
