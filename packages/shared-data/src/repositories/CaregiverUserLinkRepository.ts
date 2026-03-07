import { prismaClient } from '@naiber/shared-clients';

export class CaregiverUserLinkRepository {
    static async createLink(caregiverId: string, userId: string, isPrimary: boolean = false) {
        try {
            return await prismaClient.caregiverUserLink.create({
                data: { caregiverId, userId, isPrimary, status: 'ACTIVE' },
            });
        } catch (error) {
            console.error('[CaregiverUserLinkRepository] Error creating link:', error);
            throw error;
        }
    }

    static async acceptLink(linkId: string) {
        try {
            return await prismaClient.caregiverUserLink.update({
                where: { id: linkId },
                data: { status: 'ACTIVE' },
            });
        } catch (error) {
            console.error('[CaregiverUserLinkRepository] Error accepting link:', error);
            throw error;
        }
    }

    static async removeLink(linkId: string) {
        try {
            return await prismaClient.caregiverUserLink.update({
                where: { id: linkId },
                data: { status: 'REMOVED' },
            });
        } catch (error) {
            console.error('[CaregiverUserLinkRepository] Error removing link:', error);
            throw error;
        }
    }

    static async findByCaregiverAndUser(caregiverId: string, userId: string) {
        try {
            return await prismaClient.caregiverUserLink.findUnique({
                where: { caregiverId_userId: { caregiverId, userId } },
            });
        } catch (error) {
            console.error('[CaregiverUserLinkRepository] Error finding link:', error);
            throw error;
        }
    }

    static async findCaregiversByUser(userId: string) {
        try {
            const links = await prismaClient.caregiverUserLink.findMany({
                where: { userId, status: 'ACTIVE' },
                include: {
                    caregiver: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            relationship: true,
                        }
                    }
                }
            });
            return links.map(link => ({ ...link.caregiver, isPrimary: link.isPrimary, linkId: link.id }));
        } catch (error) {
            console.error('[CaregiverUserLinkRepository] Error finding caregivers by user:', error);
            throw error;
        }
    }
}
