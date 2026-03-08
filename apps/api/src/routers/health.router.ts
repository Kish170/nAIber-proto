import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { HealthRepository } from '@naiber/shared-data';
import { prismaClient } from '@naiber/shared-clients';

export const healthRouter = router({
    getHealthCheckLogs: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            limit: z.number().min(1).max(50).default(10),
        }))
        .query(async ({ input }) => {
            return await prismaClient.healthCheckLog.findMany({
                where: { elderlyProfileId: input.elderlyProfileId },
                orderBy: { createdAt: 'desc' },
                take: input.limit,
            });
        }),

    getConditions: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }) => {
            return await HealthRepository.findHealthConditionsByElderlyProfileId(input.elderlyProfileId);
        }),

    getMedications: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }) => {
            return await HealthRepository.findMedicationsByElderlyProfileId(input.elderlyProfileId);
        }),
});
