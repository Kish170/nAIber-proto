import { prismaClient } from '@naiber/shared-clients';

export interface HealthCheckLogData {
    elderlyProfileId: string;
    conversationId: string;
    callLogId?: string;
    answers: object[];
}

export interface WellbeingLogData {
    healthCheckLogId: string;
    elderlyProfileId: string;
    conversationId: string;
    overallWellbeing?: number | null;
    sleepQuality?: number | null;
    physicalSymptoms?: string[];
    generalNotes?: string | null;
    concerns?: string[];
    positives?: string[];
}

export interface MedicationLogData {
    healthCheckLogId: string;
    elderlyProfileId: string;
    conversationId: string;
    medicationId: string;
    medicationTaken?: boolean | null;
    notes?: string | null;
    adherenceContext?: string | null;
    takenAt?: Date | string | null;
    periodStart?: Date | string | null;
    periodEnd?: Date | string | null;
    adherenceRating?: string | null;
}

export interface HealthConditionLogData {
    healthCheckLogId: string;
    elderlyProfileId: string;
    conversationId: string;
    conditionId: string;
    rawNotes?: string | null;
    symptoms?: string[];
    severity?: string | null;
    changeFromBaseline?: string | null;
    notableFlags?: string[];
}

export class HealthRepository {
    static async getCallFrequency(elderlyProfileId: string): Promise<'DAILY' | 'WEEKLY'> {
        try {
            const profile = await prismaClient.elderlyProfile.findUnique({
                where: { id: elderlyProfileId },
                select: { callFrequency: true }
            });
            return (profile?.callFrequency as 'DAILY' | 'WEEKLY') ?? 'DAILY';
        } catch (error) {
            console.error('[HealthRepository] Unable to get call frequency:', error);
            return 'DAILY';
        }
    }

    static async findHealthConditionsByElderlyProfileId(elderlyProfileId: string) {
        try {
            return await prismaClient.userHealthCondition.findMany({
                where: {
                    elderlyProfileId
                },
                select: {
                    id: true,
                    elderlyProfileId: true,
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

    static async findMedicationsByElderlyProfileId(elderlyProfileId: string) {
        try {
            return await prismaClient.userMedication.findMany({
                where: {
                    elderlyProfileId,
                    isActive: true
                },
                select: {
                    id: true,
                    elderlyProfileId: true,
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

    static async getLastHealthCheckWithDetails(elderlyProfileId: string) {
        try {
            return await prismaClient.healthCheckLog.findFirst({
                where: { elderlyProfileId },
                orderBy: { createdAt: 'desc' },
                include: {
                    wellbeingLog: {
                        select: {
                            overallWellbeing: true,
                            sleepQuality: true,
                            physicalSymptoms: true,
                            generalNotes: true,
                        }
                    },
                    medicationLogs: {
                        select: {
                            medicationTaken: true,
                            adherenceRating: true,
                            adherenceContext: true,
                            medication: { select: { name: true } }
                        }
                    },
                    conditionLogs: {
                        select: {
                            severity: true,
                            changeFromBaseline: true,
                            notableFlags: true,
                            condition: { select: { condition: true } }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to get last health check details:', error);
            return null;
        }
    }

    static async findRecentHealthChecksWithDetails(elderlyProfileId: string, count: number = 5) {
        try {
            return await prismaClient.healthCheckLog.findMany({
                where: { elderlyProfileId },
                orderBy: { createdAt: 'desc' },
                take: count,
                include: {
                    wellbeingLog: {
                        select: {
                            overallWellbeing: true,
                            sleepQuality: true,
                            physicalSymptoms: true,
                            generalNotes: true,
                        }
                    },
                    medicationLogs: {
                        select: {
                            medicationTaken: true,
                            adherenceRating: true,
                            adherenceContext: true,
                            medication: { select: { id: true, name: true } }
                        }
                    },
                    conditionLogs: {
                        select: {
                            severity: true,
                            changeFromBaseline: true,
                            notableFlags: true,
                            condition: { select: { id: true, condition: true } }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to find recent health checks with details:', error);
            return [];
        }
    }

    // --- Dashboard query stubs (Phase E) ---
    // These will be implemented once the gold-layer aggregation design is settled.

    static async getWellbeingTrend(_elderlyProfileId: string, _days: number = 30): Promise<never> {
        throw new Error('Not implemented — pending Phase E gold-layer design');
    }

    static async getMedicationAdherenceSummary(_elderlyProfileId: string, _days: number = 30): Promise<never> {
        throw new Error('Not implemented — pending Phase E gold-layer design');
    }

    static async getConditionHistory(_elderlyProfileId: string): Promise<never> {
        throw new Error('Not implemented — pending Phase E gold-layer design');
    }

    static async getSymptomFrequency(_elderlyProfileId: string, _days: number = 30): Promise<never> {
        throw new Error('Not implemented — pending Phase E gold-layer design');
    }

    static async findHealthCheckLogsByElderlyProfileId(elderlyProfileId: string, limit: number = 10) {
        try {
            return await prismaClient.healthCheckLog.findMany({
                where: { elderlyProfileId },
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to find health check logs:', error);
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

    static async createWellbeingLog(data: WellbeingLogData) {
        try {
            return await prismaClient.wellbeingLog.create({ data });
        } catch (error) {
            console.error('[HealthRepository] Unable to create wellbeing log:', error);
            throw error;
        }
    }

    static async createMedicationLog(data: MedicationLogData) {
        try {
            return await prismaClient.medicationLog.create({ data });
        } catch (error) {
            console.error('[HealthRepository] Unable to create medication log:', error);
            throw error;
        }
    }

    static async createHealthConditionLog(data: HealthConditionLogData) {
        try {
            return await prismaClient.healthConditionLog.create({
                data: {
                    ...data,
                    symptoms: data.symptoms ?? [],
                    notableFlags: data.notableFlags ?? []
                }
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to create health condition log:', error);
            throw error;
        }
    }
}
