import { MedicationCategory, MedicationFrequency, PrismaClient } from '../../../generated/prisma';
import { MedicationData, UserMedicationData } from '../types/Types';

const prismaClient = new PrismaClient();

export class MedicationCRUD {
  // Medication management
  async createMedication(data: MedicationData) {
    return await prismaClient.medication.create({
      data: {
        name: data.name,
        genericName: data.genericName,
        category: data.category
      }
    });
  }

  async getMedicationByName(name: string) {
    return await prismaClient.medication.findFirst({
      where: {
        OR: [
          {
            name: {
              contains: name,
              mode: 'insensitive'
            }
          },
          {
            genericName: {
              contains: name,
              mode: 'insensitive'
            }
          }
        ]
      }
    });
  }

  async getAllMedications() {
    return await prismaClient.medication.findMany({
      orderBy: {
        name: 'asc'
      }
    });
  }

  // User Medication management
  async addUserMedication(data: UserMedicationData) {
    return await prismaClient.userMedication.create({
      data: {
        userId: data.userId,
        medicationId: data.medicationId,
        dosage: data.dosage,
        frequency: data.frequency,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        prescriber: data.prescriber,
        notes: data.notes,
        isActive: data.isActive ?? true
      },
      include: {
        medication: true
      }
    });
  }

  async getUserMedications(userId: string) {
    return await prismaClient.userMedication.findMany({
      where: {
        userId: userId,
        isActive: true
      },
      include: {
        medication: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async updateUserMedication(userMedicationId: string, data: Partial<UserMedicationData>) {
    const updateData: any = {};
    if (data.dosage !== undefined) updateData.dosage = data.dosage;
    if (data.frequency !== undefined) updateData.frequency = data.frequency;
    if (data.startedAt !== undefined) updateData.startedAt = data.startedAt;
    if (data.endedAt !== undefined) updateData.endedAt = data.endedAt;
    if (data.prescriber !== undefined) updateData.prescriber = data.prescriber;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return await prismaClient.userMedication.update({
      where: { id: userMedicationId },
      data: updateData,
      include: {
        medication: true
      }
    });
  }

  async removeUserMedication(userMedicationId: string) {
    return await prismaClient.userMedication.update({
      where: { id: userMedicationId },
      data: { isActive: false }
    });
  }

  // Helper method to find or create medication
  async findOrCreateMedication(name: string, category: MedicationCategory, genericName?: string) {
    let medication = await this.getMedicationByName(name);
    
    if (!medication) {
      medication = await this.createMedication({
        name,
        genericName,
        category
      });
    }
    
    return medication;
  }
}
