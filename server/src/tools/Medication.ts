import { PrismaClient, MedicationCategory, Prisma } from '../../../generated/prisma';

const prismaClient = new PrismaClient();

export class MedicationTools {
  async createMedication(data: Prisma.MedicationCreateInput) {
    if (!data.name?.trim()) {
      throw new Error('Medication name is required');
    }

    return await prismaClient.medication.create({ data });
  }

  async getMedicationByName(name: string) {
    if (!name?.trim()) {
      throw new Error('Medication name is required');
    }

    return await prismaClient.medication.findFirst({
      where: {
        OR: [
          {
            name: {
              equals: name,
              mode: 'insensitive'
            }
          },
          {
            genericName: {
              equals: name,
              mode: 'insensitive'
            }
          }
        ]
      }
    });
  }

  async getMedicationById(id: string) {
    if (!id?.trim()) {
      throw new Error('Medication ID is required');
    }

    return await prismaClient.medication.findUnique({
      where: { id }
    });
  }

  async getAllMedications() {
    return await prismaClient.medication.findMany({
      orderBy: { name: 'asc' }
    });
  }

  async addUserMedication(data: Prisma.UserMedicationCreateInput) {
    return await prismaClient.userMedication.create({
      data,
      include: {
        medication: true,
        user: {
          select: { id: true, fullName: true }
        }
      }
    });
  }

  async getUserMedications(userId: string) {
    if (!userId?.trim()) {
      throw new Error('User ID is required');
    }

    return await prismaClient.userMedication.findMany({
      where: {
        userId,
        isActive: true
      },
      include: {
        medication: true
      },
      orderBy: [
        { createdAt: 'desc' }
      ]
    });
  }

  async getUserMedicationById(id: string) {
    if (!id?.trim()) {
      throw new Error('User medication ID is required');
    }

    return await prismaClient.userMedication.findUnique({
      where: { id },
      include: {
        medication: true,
        user: {
          select: { id: true, fullName: true }
        }
      }
    });
  }

  async updateUserMedication(userMedicationId: string, data: Prisma.UserMedicationUpdateInput) {
    if (!userMedicationId?.trim()) {
      throw new Error('User medication ID is required');
    }

    return await prismaClient.userMedication.update({
      where: { id: userMedicationId },
      data,
      include: {
        medication: true
      }
    });
  }

  async removeUserMedication(userMedicationId: string) {
    if (!userMedicationId?.trim()) {
      throw new Error('User medication ID is required');
    }

    return await prismaClient.userMedication.update({
      where: { id: userMedicationId },
      data: { isActive: false }
    });
  }

  async deleteUserMedication(userMedicationId: string) {
    if (!userMedicationId?.trim()) {
      throw new Error('User medication ID is required');
    }

    return await prismaClient.userMedication.delete({
      where: { id: userMedicationId }
    });
  }

  async findOrCreateMedication(name: string, category: MedicationCategory, genericName?: string) {
    if (!name?.trim()) {
      throw new Error('Medication name is required');
    }

    let medication = await this.getMedicationByName(name);
    
    if (!medication) {
      medication = await this.createMedication({
        name: name.trim(),
        genericName: genericName?.trim(),
        category
      });
    }
    
    return medication;
  }
}
