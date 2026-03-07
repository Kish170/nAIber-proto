import { prismaClient } from '@naiber/shared-clients';
import { caregiverProfileInclude, CaregiverProfileData } from '@naiber/shared-core';

export interface CaregiverAccountCreateData {
    email: string;
    name: string;
    phone?: string;
    passwordHash?: string;
    authProvider?: string;
    relationship: 'SPOUSE' | 'DAUGHTER' | 'SON' | 'SIBLING' | 'FRIEND' | 'CAREGIVER' | 'OTHER';
}

export class CaregiverRepository {
    static async findByEmail(email: string): Promise<CaregiverProfileData | null> {
        try {
            return await prismaClient.caregiverAccount.findUnique({
                where: { email },
                include: caregiverProfileInclude,
            });
        } catch (error) {
            console.error('[CaregiverRepository] Error finding caregiver by email:', error);
            throw error;
        }
    }

    static async findById(id: string): Promise<CaregiverProfileData | null> {
        try {
            return await prismaClient.caregiverAccount.findUnique({
                where: { id },
                include: caregiverProfileInclude,
            });
        } catch (error) {
            console.error('[CaregiverRepository] Error finding caregiver by ID:', error);
            throw error;
        }
    }

    static async create(data: CaregiverAccountCreateData): Promise<CaregiverProfileData> {
        try {
            return await prismaClient.caregiverAccount.create({
                data,
                include: caregiverProfileInclude,
            });
        } catch (error) {
            console.error('[CaregiverRepository] Error creating caregiver:', error);
            throw error;
        }
    }

    static async updateLastLogin(id: string): Promise<void> {
        try {
            await prismaClient.caregiverAccount.update({
                where: { id },
                data: { lastLoginAt: new Date() },
            });
        } catch (error) {
            console.error('[CaregiverRepository] Error updating last login:', error);
            throw error;
        }
    }

    static async findManagedUsers(caregiverId: string) {
        try {
            const links = await prismaClient.caregiverUserLink.findMany({
                where: { caregiverId, status: 'ACTIVE' },
                include: {
                    user: {
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
            return links.map(link => link.user);
        } catch (error) {
            console.error('[CaregiverRepository] Error finding managed users:', error);
            throw error;
        }
    }
}
