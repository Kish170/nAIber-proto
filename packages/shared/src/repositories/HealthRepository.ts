import { prismaClient } from '../clients/PrismaDBClient.js';

export interface HealthLog {
    userId: string;
    conversationId: string;
    callLogId?: string;
    overallWellBeing?: number;
    physicalSymptoms?: string[];
    sleepQuality?: number;
    generalNotes?: string;
}

export interface MedicationLog {
    userId: string;
    conversationId: string;
    callLogId?: string;
    medicationId: string;
    medicationTaken: boolean;
}

export interface HealthConditionLog {
    userId: string;
    conversationId: string;
    callLogId?: string;
    healthConditionId: string;
    symptoms: string[];
    notes?: string;
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

    // static async getMedicationsForCondition(userId: string, condition: string) {
    //     try {
    //         return await prismaClient.medicationCondition.findMany({
    //             where: {
    //                 healthCondition: {
    //                     isActive: true
    //                 },
    //                 medication: {
    //                     isActive: true
    //                 }
    //             },
    //             include: {
    //                 medication: true,
    //                 healthCondition: true
    //             }
    //         });
    //     } catch (error) {
    //         console.error('[HealthRepository] Unable to get medications for condition:', error);
    //         throw error;
    //     }
    // }

    static async createHealthLog(data: HealthLog) {
        try {
            return await prismaClient.healthLog.create({
                data
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to create health log:', error);
            throw error;
        }
    }

    static async createMedicationLog(data: MedicationLog) {
        try {
            return await prismaClient.medicationLog.create({
                data
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to create medication log:', error);
            throw error;
        }
    }

    static async createHealthConditionLog(data: HealthConditionLog) {
        try {
            return await prismaClient.healthConditionLog.create({
                data
            });
        } catch (error) {
            console.error('[HealthRepository] Unable to create health condition log:', error);
            throw error;
        }
    }
}
