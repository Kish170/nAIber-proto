import { prismaClient } from '../clients/PrismaDBClient.js';

export interface HealthCheckLogData {
    userId: string;
    conversationId: string;
    callLogId?: string;
    answers: object[];
}

export class HealthRepository {
    static async findHealthConditionsByUserId(userId: string) {
        try {
            return await prismaClient.userHealthCondition.findMany({
                where: {
                    userId: userId
                },
                select: {
                    id: true,
                    userId: true,
                    condition: true,
                    severity: true,
                    diagnosedAt: true,
                    notes: true,
                    isActive: true
                }
            })
        } catch (error) {
            console.error('[HealthRepository] Unable to get user\'s health conditions:', error);
            throw error;
        }
    }

    static async findMedicationsByUserId(userId: string) {
        try {
            return await prismaClient.userMedication.findMany({
                where: {
                    userId: userId,
                    isActive: true
                },
                select: {
                    id: true,
                    userId: true,
                    name: true,
                    dosage: true,
                    frequency: true,
                    startedAt: true,
                    endedAt: true,
                    notes: true,
                    isActive: true
                }
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to get user\'s medications:', error);
            throw error;
        }
    }

    static async linkMedicationToCondition(medicationId: string, healthConditionId: string) {
        try {
            return await prismaClient.medicationCondition.upsert({
                where: {
                    medicationId_healthConditionId: {
                        medicationId: medicationId,
                        healthConditionId: healthConditionId
                    }
                },
                create: {
                    medicationId: medicationId,
                    healthConditionId: healthConditionId
                },
                update: {}
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to link medication to condition:', error);
            throw error;
        }
    }

    static async createHealthCheckLog(data: HealthCheckLogData) {
        try {
            return await prismaClient.healthCheckLog.create({ data });
        } catch (error) {
            console.error('[HealthRepository] Unable to create health check log:', error);
            throw error;
        }
    }
}
