import { prismaClient } from '@naiber/shared-clients';
import { elderlyProfileInclude, ElderlyProfileData, MedicationSchedule } from '@naiber/shared-core';
import type { Gender, EducationLevel, CheckInFrequency } from '../../../../generated/prisma/index.js';

export interface CreateElderlyProfileData {
    name: string;
    phone: string;
    age?: number;
    email?: string;
    gender?: Gender;
    educationLevel?: EducationLevel;
    interests: string[];
    dislikes: string[];
    callFrequency: CheckInFrequency;
    preferredCallTime: Date;
    enableHealthCheckIns?: boolean;
    hasWebAccess?: boolean;
    emergencyContact?: {
        name: string;
        phone: string;
        email?: string;
        relationship: string;
        notifyOnMissedCalls?: boolean;
    };
    healthConditions?: { condition: string }[];
    medications?: { name: string; dosage: string; frequency: MedicationSchedule }[];
}

export class UserRepository {
    static async create(data: CreateElderlyProfileData, caregiverProfileId: string): Promise<ElderlyProfileData> {
        try {
            const profile = await prismaClient.elderlyProfile.create({
                data: {
                    name: data.name,
                    phone: data.phone,
                    age: data.age,
                    email: data.email,
                    gender: data.gender,
                    educationLevel: data.educationLevel,
                    interests: data.interests,
                    dislikes: data.dislikes,
                    callFrequency: data.callFrequency,
                    preferredCallTime: data.preferredCallTime,
                    enableHealthCheckIns: data.enableHealthCheckIns ?? false,
                    hasWebAccess: data.hasWebAccess ?? false,
                    emergencyContact: data.emergencyContact
                        ? { create: data.emergencyContact }
                        : undefined,
                    healthConditions: data.healthConditions?.length
                        ? { create: data.healthConditions }
                        : undefined,
                    medications: data.medications?.length
                        ? { create: data.medications as any[] }
                        : undefined,
                    caregiverLinks: {
                        create: {
                            caregiverProfileId,
                            isPrimary: true,
                        },
                    },
                },
                include: elderlyProfileInclude,
            });
            return profile as unknown as ElderlyProfileData;
        } catch (error) {
            console.error('[UserRepository] Error creating elderly profile:', error);
            throw error;
        }
    }

    static async findByPhone(phone: string): Promise<ElderlyProfileData | null> {
        try {
            return await prismaClient.elderlyProfile.findUnique({
                where: { phone },
                include: elderlyProfileInclude
            });
        } catch (error) {
            console.error('[UserRepository] Error finding user by phone:', error);
            throw error;
        }
    }

    static async findById(id: string): Promise<ElderlyProfileData | null> {
        try {
            return await prismaClient.elderlyProfile.findUnique({
                where: { id },
                include: elderlyProfileInclude
            });
        } catch (error) {
            console.error('[UserRepository] Error finding user by ID:', error);
            throw error;
        }
    }

    static async updateLastCallAt(elderlyProfileId: string, timestamp: Date): Promise<void> {
        try {
            await prismaClient.elderlyProfile.update({
                where: { id: elderlyProfileId },
                data: {
                    lastCallAt: timestamp,
                    isFirstCall: false
                }
            });
        } catch (error) {
            console.error('[UserRepository] Error updating last call timestamp:', error);
            throw error;
        }
    }
}
