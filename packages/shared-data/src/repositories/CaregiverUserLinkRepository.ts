import { prismaClient } from '@naiber/shared-clients';

export class CaregiverUserLinkRepository {
    static async createLink(caregiverProfileId: string, elderlyProfileId: string, isPrimary: boolean = false) {
        try {
            return await prismaClient.caregiverUserLink.create({
                data: { caregiverProfileId, elderlyProfileId, isPrimary, status: 'ACTIVE' },
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

    static async findByCaregiverAndUser(caregiverProfileId: string, elderlyProfileId: string) {
        try {
            return await prismaClient.caregiverUserLink.findUnique({
                where: { caregiverProfileId_elderlyProfileId: { caregiverProfileId, elderlyProfileId } },
            });
        } catch (error) {
            console.error('[CaregiverUserLinkRepository] Error finding link:', error);
            throw error;
        }
    }

    static async findCaregiversByUser(elderlyProfileId: string) {
        try {
            const links = await prismaClient.caregiverUserLink.findMany({
                where: { elderlyProfileId, status: 'ACTIVE' },
                include: {
                    caregiverProfile: {
                        select: {
                            id: true,
                            name: true,
                            relationship: true,
                        }
                    }
                }
            });
            return links.map(link => ({ ...link.caregiverProfile, isPrimary: link.isPrimary, linkId: link.id }));
        } catch (error) {
            console.error('[CaregiverUserLinkRepository] Error finding caregivers by user:', error);
            throw error;
        }
    }
}
