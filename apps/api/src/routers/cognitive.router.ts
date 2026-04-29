import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { CognitiveRepository } from '@naiber/shared-data';

export const cognitiveRouter = router({
    getSessions: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            limit: z.number().min(1).max(50).default(10),
        }))
        .query(async ({ input }: { input: any }) => {
            return await CognitiveRepository.findSessionsWithCallLog(input.elderlyProfileId, input.limit);
        }),

    getSessionDetail: caregiverProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await CognitiveRepository.findSessionDetailById(input.id);
        }),

    getBaseline: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }: { input: any }) => {
            return await CognitiveRepository.getLatestBaseline(input.elderlyProfileId);
        }),

    getTrends: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            count: z.number().min(2).max(20).default(10),
        }))
        .query(async ({ input }: { input: any }) => {
            return await CognitiveRepository.findRecentCompletedResults(input.elderlyProfileId, input.count);
        }),

    getDomainTrends: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            count: z.number().min(2).max(20).default(10),
        }))
        .query(async ({ input }: { input: any }) => {
            return await CognitiveRepository.findDomainTrends(input.elderlyProfileId, input.count);
        }),
});
