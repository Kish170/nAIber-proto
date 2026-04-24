import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { CaregiverRepository, CaregiverUserLinkRepository } from '@naiber/shared-data';

export const caregiverRouter = router({
    getProfile: caregiverProcedure
        .query(async ({ ctx }: { ctx: any }) => {
            return await CaregiverRepository.findById(ctx.session.caregiverProfileId!);
        }),

    getManagedUsers: caregiverProcedure
        .query(async ({ ctx }: { ctx: any }) => {
            return await CaregiverRepository.findManagedUsers(ctx.session.caregiverProfileId!);
        }),

    linkElderlyUser: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            isPrimary: z.boolean().default(false),
        }))
        .mutation(async ({ ctx, input }: { ctx: any; input: any }) => {
            const existing = await CaregiverUserLinkRepository.findByCaregiverAndUser(
                ctx.session.caregiverProfileId!,
                input.elderlyProfileId,
            );
            if (existing) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Link already exists between this caregiver and elderly user' });
            }
            return await CaregiverUserLinkRepository.createLink(
                ctx.session.caregiverProfileId!,
                input.elderlyProfileId,
                input.isPrimary,
            );
        }),

    removeLink: caregiverProcedure
        .input(z.object({ linkId: z.string().uuid() }))
        .mutation(async ({ input }: { input: any }) => {
            return await CaregiverUserLinkRepository.removeLink(input.linkId);
        }),
});
