import { prismaClient } from '../clients/PrismaDBClient.js';
import { userProfileInclude, UserProfileData } from '../types/database.js';

export class UserRepository {
    static async findByPhone(phone: string): Promise<UserProfileData | null> {
        try {
            const userData = await prismaClient.user.findUnique({
                where: { phone },
                include: userProfileInclude
            });

            return userData;
        } catch (error) {
            console.error('[UserRepository] Error finding user by phone:', error);
            throw error;
        }
    }

    static async findById(id: string): Promise<UserProfileData | null> {
        try {
            const userData = await prismaClient.user.findUnique({
                where: { id },
                include: userProfileInclude
            });

            return userData;
        } catch (error) {
            console.error('[UserRepository] Error finding user by ID:', error);
            throw error;
        }
    }

    static async updateLastCallAt(userId: string, timestamp: Date): Promise<void> {
        try {
            await prismaClient.user.update({
                where: { id: userId },
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
