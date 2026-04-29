import { z } from 'zod';
import { caregiverProcedure, router } from '../trpc/init.js';
import { prismaClient } from '@naiber/shared-clients';

export const notificationsRouter = router({
    getForElderly: caregiverProcedure
        .input(z.object({
            elderlyProfileId: z.string().uuid(),
            limit: z.number().min(1).max(20).default(10),
        }))
        .query(async ({ input }: { input: any }) => {
            return await prismaClient.notification.findMany({
                where: { elderlyProfileId: input.elderlyProfileId },
                orderBy: { createdAt: 'desc' },
                take: input.limit,
            });
        }),
});
