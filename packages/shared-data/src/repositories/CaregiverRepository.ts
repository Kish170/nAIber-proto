import { prismaClient } from '@naiber/shared-clients';
import { caregiverProfileInclude, CaregiverProfileData } from '@naiber/shared-core';

export interface CaregiverProfileCreateData {
    authUserId: string;
    name: string;
    phone?: string;
    relationship: 'SPOUSE' | 'DAUGHTER' | 'SON' | 'SIBLING' | 'FRIEND' | 'CAREGIVER' | 'OTHER';
}

export class CaregiverRepository {
    static async findByAuthUserId(authUserId: string): Promise<CaregiverProfileData | null> {
        try {
            return await prismaClient.caregiverProfile.findUnique({
                where: { authUserId },
                include: caregiverProfileInclude,
            });
        } catch (error) {
            console.error('[CaregiverRepository] Error finding caregiver by auth user ID:', error);
            throw error;
        }
    }

    static async findById(id: string): Promise<CaregiverProfileData | null> {
        try {
            return await prismaClient.caregiverProfile.findUnique({
                where: { id },
                include: caregiverProfileInclude,
            });
        } catch (error) {
            console.error('[CaregiverRepository] Error finding caregiver by ID:', error);
            throw error;
        }
    }

    static async create(data: CaregiverProfileCreateData): Promise<CaregiverProfileData> {
        try {
            return await prismaClient.caregiverProfile.create({
                data,
                include: caregiverProfileInclude,
            });
        } catch (error) {
            console.error('[CaregiverRepository] Error creating caregiver:', error);
            throw error;
        }
    }

    static async findManagedUsers(caregiverProfileId: string) {
        try {
            const links = await prismaClient.caregiverUserLink.findMany({
                where: { caregiverProfileId, status: 'ACTIVE' },
                include: {
                    elderlyProfile: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            age: true,
                            activationStatus: true,
                            lastCallAt: true,
                            callFrequency: true,
                        }
                    }
                }
            });
            return links.map(link => link.elderlyProfile);
        } catch (error) {
            console.error('[CaregiverRepository] Error finding managed users:', error);
            throw error;
        }
    }
}
