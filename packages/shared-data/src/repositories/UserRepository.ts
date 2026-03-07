import { prismaClient } from '@naiber/shared-clients';
import { elderlyProfileInclude, ElderlyProfileData } from '@naiber/shared-core';

export class UserRepository {
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
