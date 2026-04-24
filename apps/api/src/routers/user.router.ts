import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { caregiverProcedure, elderlyProcedure, router } from '../trpc/init.js';
import { UserRepository } from '@naiber/shared-data';

export const userRouter = router({
    getById: caregiverProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            const profile = await UserRepository.findById(input.id);
            if (!profile) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Elderly profile not found' });
            }
            return profile;
        }),

    getOwnProfile: elderlyProcedure
        .query(async ({ ctx }: { ctx: any }) => {
            const profile = await UserRepository.findById(ctx.session.elderlyProfileId!);
            if (!profile) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
            }
            return profile;
        }),
});
