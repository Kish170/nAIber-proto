import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { CognitiveRepository } from '@naiber/shared-data';
import { cognitiveSessionInclude } from '@naiber/shared-core';
import { prismaClient } from '@naiber/shared-clients';

export const cognitiveRouter = router({
    getSessions: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            limit: z.number().min(1).max(50).default(10),
        }))
        .query(async ({ input }) => {
            return await prismaClient.cognitiveTestResult.findMany({
                where: { elderlyProfileId: input.elderlyProfileId },
                include: cognitiveSessionInclude,
                orderBy: { completedAt: 'desc' },
                take: input.limit,
            });
        }),

    getSessionDetail: caregiverProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ input }) => {
            return await prismaClient.cognitiveTestResult.findUnique({
                where: { id: input.id },
                include: cognitiveSessionInclude,
            });
        }),

    getBaseline: caregiverProcedure
        .input(z.object({ elderlyProfileId: z.string().uuid() }))
        .query(async ({ input }) => {
            return await CognitiveRepository.getLatestBaseline(input.elderlyProfileId);
        }),

    getTrends: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            count: z.number().min(2).max(20).default(10),
        }))
        .query(async ({ input }) => {
            return await CognitiveRepository.findRecentCompletedResults(input.elderlyProfileId, input.count);
        }),
});
