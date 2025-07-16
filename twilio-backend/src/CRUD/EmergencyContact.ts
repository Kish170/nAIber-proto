import { Relationship, PrismaClient } from '../../../generated/prisma';
import { EmergencyContactData } from '../types/Types';

const prismaClient = new PrismaClient();

export class EmergencyContactCRUD {
  async createEmergencyContact(data: EmergencyContactData) {
    return await prismaClient.emergencyContact.create({
      data: {
        name: data.name,
        phoneNumber: data.phoneNumber,
        relationship: data.relationship,
        userId: data.userId,
        email: data.email,
        isPrimary: data.isPrimary || false,
        address: data.address,
        notes: data.notes,
      }
    });
  }

  async getEmergencyContactsByUserId(userId: string) {
    return await prismaClient.emergencyContact.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        isPrimary: 'desc'
      }
    });
  }

  async updateEmergencyContact(contactId: string, data: Partial<EmergencyContactData>) {
    return await prismaClient.emergencyContact.update({
      where: { id: contactId },
      data: data
    });
  }

  // async deleteEmergencyContact(contactId: string) {
  //   return await prismaClient.emergencyContact.update({
  //     where: { id: contactId },
  //     data: { isActive: false }
  //   });
  // }
}
