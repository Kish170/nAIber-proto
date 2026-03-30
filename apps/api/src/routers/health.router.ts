import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { HealthRepository } from '@naiber/shared-data';

export const healthRouter = router({
    getHealthCheckLogs: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            limit: z.number().min(1).max(50).default(10),
        }))
        .query(async ({ input }) => {
            return await HealthRepository.findHealthCheckLogsByElderlyProfileId(input.elderlyProfileId, input.limit);
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

    getLastHealthCheckDetails: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }) => {
            return await HealthRepository.getLastHealthCheckWithDetails(input.elderlyProfileId);
        }),

    // --- Dashboard trend endpoints (Phase E — pending gold-layer aggregation design) ---

    getWellbeingTrend: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid(), days: z.number().min(1).max(365).default(30) }))
        .query(async () => {
            throw new Error('Not implemented');
        }),

    getMedicationAdherence: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid(), days: z.number().min(1).max(365).default(30) }))
        .query(async () => {
            throw new Error('Not implemented');
        }),

    getConditionHistory: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async () => {
            throw new Error('Not implemented');
        }),

    getSymptomFrequency: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid(), days: z.number().min(1).max(365).default(30) }))
        .query(async () => {
            throw new Error('Not implemented');
        }),
});
