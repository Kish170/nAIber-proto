import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { HealthRepository } from '@naiber/shared-data';

export const healthRouter = router({
    getHealthCheckBySession: caregiverProcedure
        .input(z.object({ callLogId: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.getHealthCheckByCallLogId(input.callLogId);
        }),

    getHealthCheckLogs: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            limit: z.number().min(1).max(50).default(10),
        }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.findHealthCheckLogsByElderlyProfileId(input.elderlyProfileId, input.limit);
        }),

    getConditions: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.findHealthConditionsByElderlyProfileId(input.elderlyProfileId);
        }),

    getMedications: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.findMedicationsByElderlyProfileId(input.elderlyProfileId);
        }),

    getLastHealthCheckDetails: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.getLastHealthCheckWithDetails(input.elderlyProfileId);
        }),

    getHealthBaseline: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.getHealthBaseline(input.elderlyProfileId);
        }),

    getWellbeingTrend: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid(), days: z.number().min(1).max(365).default(30) }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.getWellbeingTrend(input.elderlyProfileId, input.days);
        }),

    getMedicationAdherenceTrend: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid(), days: z.number().min(1).max(365).default(30) }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.getMedicationAdherenceTrend(input.elderlyProfileId, input.days);
        }),

    getConditionHistory: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.getConditionHistory(input.elderlyProfileId);
        }),

    getSymptomFrequency: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid(), days: z.number().min(1).max(365).default(30) }))
        .query(async ({ input }: { input: any }) => {
            return await HealthRepository.getSymptomFrequency(input.elderlyProfileId, input.days);
        }),
});
