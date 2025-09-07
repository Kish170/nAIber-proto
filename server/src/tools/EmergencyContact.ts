import { PrismaClient, Prisma } from '../../../generated/prisma';

const prismaClient = new PrismaClient();

export class EmergencyContactTools {
  async createEmergencyContact(data: Prisma.EmergencyContactCreateInput) {
    return await prismaClient.emergencyContact.create({ 
      data,
      include: {
        user: {
          select: { id: true, fullName: true }
        }
      }
    });
  }

  async getEmergencyContactsByUserId(userId: string) {
    if (!userId?.trim()) {
      throw new Error('User ID is required');
    }

    return await prismaClient.emergencyContact.findMany({
      where: { userId },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' }
      ]
    });
  }

  async getEmergencyContactById(contactId: string) {
    if (!contactId?.trim()) {
      throw new Error('Contact ID is required');
    }

    return await prismaClient.emergencyContact.findUnique({
      where: { id: contactId },
      include: {
        user: {
          select: { id: true, fullName: true }
        }
      }
    });
  }

  async updateEmergencyContact(contactId: string, data: Prisma.EmergencyContactUpdateInput) {
    if (!contactId?.trim()) {
      throw new Error('Contact ID is required');
    }

    return await prismaClient.emergencyContact.update({
      where: { id: contactId },
      data
    });
  }

  async deleteEmergencyContact(contactId: string) {
    if (!contactId?.trim()) {
      throw new Error('Contact ID is required');
    }

    return await prismaClient.emergencyContact.delete({
      where: { id: contactId }
    });
  }

  async setPrimaryContact(userId: string, contactId: string) {
    if (!userId?.trim() || !contactId?.trim()) {
      throw new Error('User ID and Contact ID are required');
    }

    return await prismaClient.$transaction(async (tx) => {
      await tx.emergencyContact.updateMany({
        where: { userId },
        data: { isPrimary: false }
      });

      return await tx.emergencyContact.update({
        where: { id: contactId },
        data: { isPrimary: true }
      });
    });
  }
}
