import { prismaClient } from '@naiber/shared-clients';
import type { ConditionSeverity, ConditionChangeStatus } from '../../../../generated/prisma/index.js';

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

    static async upsertHealthBaseline(elderlyProfileId: string, data: {
        callsIncluded: number;
        avgWellbeing: number | null;
        avgSleepQuality: number | null;
        symptoms: Array<{ symptom: string; count: number }>;
        medications: Array<{ medicationId: string; medicationName: string; takenCount: number; totalCount: number; adherenceRate: number }>;
        conditions: Array<{ conditionId: string; conditionName: string; latestSeverity: ConditionSeverity | null; latestChange: ConditionChangeStatus | null }>;
    }) {
        try {
            return await prismaClient.$transaction(async (tx) => {
                const baseline = await tx.healthBaseline.upsert({
                    where: { elderlyProfileId },
                    create: {
                        elderlyProfileId,
                        callsIncluded: data.callsIncluded,
                        avgWellbeing: data.avgWellbeing,
                        avgSleepQuality: data.avgSleepQuality,
                        computedAt: new Date(),
                    },
                    update: {
                        callsIncluded: data.callsIncluded,
                        avgWellbeing: data.avgWellbeing,
                        avgSleepQuality: data.avgSleepQuality,
                        computedAt: new Date(),
                    }
                });

                await tx.healthBaselineSymptom.deleteMany({ where: { baselineId: baseline.id } });
                await tx.healthBaselineMedication.deleteMany({ where: { baselineId: baseline.id } });
                await tx.healthBaselineCondition.deleteMany({ where: { baselineId: baseline.id } });

                if (data.symptoms.length) {
                    await tx.healthBaselineSymptom.createMany({
                        data: data.symptoms.map(s => ({ baselineId: baseline.id, symptom: s.symptom, count: s.count }))
                    });
                }
                if (data.medications.length) {
                    await tx.healthBaselineMedication.createMany({
                        data: data.medications.map(m => ({ baselineId: baseline.id, ...m }))
                    });
                }
                if (data.conditions.length) {
                    await tx.healthBaselineCondition.createMany({
                        data: data.conditions.map(c => ({ baselineId: baseline.id, ...c }))
                    });
                }

                return baseline;
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to upsert health baseline:', error);
            throw error;
        }
    }

    static async getHealthBaseline(elderlyProfileId: string) {
        try {
            return await prismaClient.healthBaseline.findUnique({
                where: { elderlyProfileId },
                include: {
                    symptoms: { orderBy: { count: 'desc' } },
                    medications: true,
                    conditions: true,
                }
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to get health baseline:', error);
            return null;
        }
    }

    static async getWellbeingTrend(elderlyProfileId: string, days: number = 30) {
        try {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const logs = await prismaClient.wellbeingLog.findMany({
                where: { elderlyProfileId, createdAt: { gte: since } },
                select: { createdAt: true, overallWellbeing: true, sleepQuality: true },
                orderBy: { createdAt: 'asc' }
            });
            return logs.map(l => ({ date: l.createdAt, overallWellbeing: l.overallWellbeing, sleepQuality: l.sleepQuality }));
        } catch (error) {
            console.error('[HealthRepository] Unable to get wellbeing trend:', error);
            throw error;
        }
    }

    static async getMedicationAdherenceTrend(elderlyProfileId: string, days: number = 30) {
        try {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            return await prismaClient.medicationLog.findMany({
                where: { elderlyProfileId, createdAt: { gte: since } },
                select: {
                    createdAt: true,
                    medicationId: true,
                    medicationTaken: true,
                    adherenceRating: true,
                    adherenceContext: true,
                    medication: { select: { name: true } }
                },
                orderBy: { createdAt: 'asc' }
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to get medication adherence trend:', error);
            throw error;
        }
    }

    static async getConditionHistory(elderlyProfileId: string) {
        try {
            const logs = await prismaClient.healthConditionLog.findMany({
                where: { elderlyProfileId },
                select: {
                    conditionId: true,
                    severity: true,
                    changeFromBaseline: true,
                    symptoms: true,
                    createdAt: true,
                    condition: { select: { condition: true } }
                },
                orderBy: { createdAt: 'asc' }
            });

            const byCondition = new Map<string, {
                conditionName: string;
                entries: Array<{ date: Date; severity: string | null; changeFromBaseline: string | null; symptoms: string[] }>;
            }>();
            for (const log of logs) {
                const existing = byCondition.get(log.conditionId) ?? { conditionName: log.condition.condition, entries: [] };
                existing.entries.push({ date: log.createdAt, severity: log.severity, changeFromBaseline: log.changeFromBaseline, symptoms: log.symptoms });
                byCondition.set(log.conditionId, existing);
            }
            return Array.from(byCondition.entries()).map(([conditionId, data]) => ({
                conditionId, conditionName: data.conditionName, entries: data.entries
            }));
        } catch (error) {
            console.error('[HealthRepository] Unable to get condition history:', error);
            throw error;
        }
    }

    static async getSymptomFrequency(elderlyProfileId: string, days: number = 30) {
        try {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const logs = await prismaClient.wellbeingLog.findMany({
                where: { elderlyProfileId, createdAt: { gte: since } },
                select: { physicalSymptoms: true, createdAt: true }
            });

            const symptomMap = new Map<string, { count: number; lastReported: Date }>();
            for (const log of logs) {
                for (const symptom of log.physicalSymptoms) {
                    const normalized = symptom.toLowerCase().trim();
                    if (!normalized) continue;
                    const existing = symptomMap.get(normalized) ?? { count: 0, lastReported: log.createdAt };
                    existing.count++;
                    if (log.createdAt > existing.lastReported) existing.lastReported = log.createdAt;
                    symptomMap.set(normalized, existing);
                }
            }
            return Array.from(symptomMap.entries())
                .map(([symptom, data]) => ({ symptom, count: data.count, lastReported: data.lastReported }))
                .sort((a, b) => b.count - a.count);
        } catch (error) {
            console.error('[HealthRepository] Unable to get symptom frequency:', error);
            throw error;
        }
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
