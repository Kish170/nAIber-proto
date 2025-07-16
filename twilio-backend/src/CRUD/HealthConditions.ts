import { HealthCategory, Severity, PrismaClient } from '../../../generated/prisma';
import { HealthConditionData, UserHealthConditionData } from '../types/Types';

const prismaClient = new PrismaClient();

export class HealthConditionsCRUD {
  async createHealthCondition(data: HealthConditionData) {
    return await prismaClient.healthCondition.create({
      data: {
        name: data.name,
        category: data.category,
        description: data.description
      }
    });
  }

  async getHealthConditionByName(name: string) {
    return await prismaClient.healthCondition.findFirst({
      where: {
        name: {
          contains: name,
          mode: 'insensitive'
        }
      }
    });
  }

  async getAllHealthConditions() {
    return await prismaClient.healthCondition.findMany({
      orderBy: {
        name: 'asc'
      }
    });
  }

  // User Health Condition management
  async addUserHealthCondition(data: UserHealthConditionData) {
    return await prismaClient.userHealthCondition.create({
      data: {
        userId: data.userId,
        healthConditionId: data.healthConditionId,
        severity: data.severity,
        diagnosedAt: data.diagnosedAt,
        notes: data.notes,
        isActive: data.isActive ?? true
      },
      include: {
        healthCondition: true
      }
    });
  }

  async getUserHealthConditions(userId: string) {
    return await prismaClient.userHealthCondition.findMany({
      where: {
        userId: userId,
        isActive: true
      },
      include: {
        healthCondition: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async updateUserHealthCondition(userHealthConditionId: string, data: Partial<UserHealthConditionData>) {
    return await prismaClient.userHealthCondition.update({
      where: { id: userHealthConditionId },
      data: data,
      include: {
        healthCondition: true
      }
    });
  }

  async removeUserHealthCondition(userHealthConditionId: string) {
    return await prismaClient.userHealthCondition.update({
      where: { id: userHealthConditionId },
      data: { isActive: false }
    });
  }

  // Helper method to find or create health condition
  async findOrCreateHealthCondition(name: string, category: HealthCategory, description?: string) {
    let healthCondition = await this.getHealthConditionByName(name);
    
    if (!healthCondition) {
      healthCondition = await this.createHealthCondition({
        name,
        category,
        description
      });
    }
    
    return healthCondition;
  }
}
