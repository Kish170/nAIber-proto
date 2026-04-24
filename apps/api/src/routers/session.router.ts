import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { CallLogRepository } from '@naiber/shared-data';

export const sessionRouter = router({
    getCallLogs: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            limit: z.number().min(1).max(50).default(20),
            offset: z.number().min(0).default(0),
            callType: z.enum(['GENERAL', 'HEALTH_CHECK', 'COGNITIVE']).optional(),
        }))
        .query(async ({ input }: { input: any }) => {
            return await CallLogRepository.findByElderlyProfileId(input.elderlyProfileId, {
                limit: input.limit,
                offset: input.offset,
                callType: input.callType,
            });
        }),

    getCallLogDetail: caregiverProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await CallLogRepository.findById(input.id);
        }),

    getCallStats: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await CallLogRepository.getCallStats(input.elderlyProfileId);
        }),
});
