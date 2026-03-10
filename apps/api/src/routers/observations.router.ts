import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { TrustedContactRepository } from '@naiber/shared-data';

export const observationsRouter = router({
    getTrustedContacts: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }) => {
            return await TrustedContactRepository.findByElderlyProfileId(input.elderlyProfileId);
        }),

    createSubmission: caregiverProcedure
        .input(z.object({
            trustedContactId: z.string().uuid(),
            submissionType: z.enum(['ONBOARDING', 'DRIFT_TRIGGERED', 'SCHEDULED_REFRESH', 'MANUAL']),
            structuredResponses: z.record(z.unknown()),
            openTextResponses: z.record(z.unknown()).optional(),
            referencePointNote: z.string().optional(),
            rawScore: z.number(),
            informantConcernIndex: z.number(),
        }))
        .mutation(async ({ input }) => {
            const submission = await TrustedContactRepository.createSubmission(input);
            await TrustedContactRepository.updateConcernIndex(
                input.trustedContactId,
                input.informantConcernIndex,
                input.informantConcernIndex,
            );
            return submission;
        }),

    getLatestSubmission: caregiverProcedure
        .input(z.object({ trustedContactId: z.string().uuid() }))
        .query(async ({ input }) => {
            return await TrustedContactRepository.getLatestSubmission(input.trustedContactId);
        }),

    getSubmissionHistory: caregiverProcedure
        .input(z.object({ trustedContactId: z.string().uuid() }))
        .query(async ({ input }) => {
            return await TrustedContactRepository.getSubmissionHistory(input.trustedContactId);
        }),
});
