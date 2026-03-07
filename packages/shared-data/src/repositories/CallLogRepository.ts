import { prismaClient } from '@naiber/shared-clients';
import type { CallType } from '../../../../generated/prisma/index.js';

export class CallLogRepository {
    static async findByElderlyProfileId(elderlyProfileId: string, options?: { limit?: number; offset?: number; callType?: CallType }) {
        try {
            return await prismaClient.callLog.findMany({
                where: {
                    elderlyProfileId,
                    ...(options?.callType ? { callType: options.callType } : {}),
                },
                orderBy: { scheduledTime: 'desc' },
                take: options?.limit ?? 20,
                skip: options?.offset ?? 0,
                include: {
                    conversationSummary: true,
                    healthCheckLog: true,
                    cognitiveTestResult: true,
                }
            });
        } catch (error) {
            console.error('[CallLogRepository] Error finding call logs by user:', error);
            throw error;
        }
    }

    static async findById(callLogId: string) {
        try {
            return await prismaClient.callLog.findUnique({
                where: { id: callLogId },
                include: {
                    conversationSummary: true,
                    healthCheckLog: true,
                    cognitiveTestResult: true,
                }
            });
        } catch (error) {
            console.error('[CallLogRepository] Error finding call log by ID:', error);
            throw error;
        }
    }

    static async getCallStats(elderlyProfileId: string) {
        try {
            const [total, completed, lastCall] = await Promise.all([
                prismaClient.callLog.count({ where: { elderlyProfileId } }),
                prismaClient.callLog.count({ where: { elderlyProfileId, status: 'COMPLETED' } }),
                prismaClient.callLog.findFirst({
                    where: { elderlyProfileId, status: 'COMPLETED' },
                    orderBy: { scheduledTime: 'desc' },
                    select: { scheduledTime: true, endTime: true, callType: true },
                }),
            ]);
            return { total, completed, lastCall };
        } catch (error) {
            console.error('[CallLogRepository] Error getting call stats:', error);
            throw error;
        }
    }
}
