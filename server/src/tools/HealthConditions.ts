import { PrismaClient, HealthCategory, Prisma } from '../../../generated/prisma';

const prismaClient = new PrismaClient();

export class HealthConditionsTools {
  async createHealthCondition(data: Prisma.HealthConditionCreateInput) {
    if (!data.name?.trim()) {
      throw new Error('Health condition name is required');
    }

    return await prismaClient.healthCondition.create({ data });
  }

  async getHealthConditionByName(name: string) {
    if (!name?.trim()) {
      throw new Error('Health condition name is required');
    }

    return await prismaClient.healthCondition.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive'
        }
      }
    });
  }

  async getHealthConditionById(id: string) {
    if (!id?.trim()) {
      throw new Error('Health condition ID is required');
    }

    return await prismaClient.healthCondition.findUnique({
      where: { id }
    });
  }

  async getAllHealthConditions() {
    return await prismaClient.healthCondition.findMany({
      orderBy: { name: 'asc' }
    });
  }

  async addUserHealthCondition(data: Prisma.UserHealthConditionCreateInput) {
    return await prismaClient.userHealthCondition.create({
      data,
      include: {
        healthCondition: true,
        user: {
          select: { id: true, fullName: true }
        }
      }
    });
  }

  async getUserHealthConditions(userId: string) {
    if (!userId?.trim()) {
      throw new Error('User ID is required');
    }

    return await prismaClient.userHealthCondition.findMany({
      where: {
        userId,
        isActive: true
      },
      include: {
        healthCondition: true
      },
      orderBy: [
        { createdAt: 'desc' }
      ]
    });
  }

  async getUserHealthConditionById(id: string) {
    if (!id?.trim()) {
      throw new Error('User health condition ID is required');
    }

    return await prismaClient.userHealthCondition.findUnique({
      where: { id },
      include: {
        healthCondition: true,
        user: {
          select: { id: true, fullName: true }
        }
      }
    });
  }

  async updateUserHealthCondition(userHealthConditionId: string, data: Prisma.UserHealthConditionUpdateInput) {
    if (!userHealthConditionId?.trim()) {
      throw new Error('User health condition ID is required');
    }

    return await prismaClient.userHealthCondition.update({
      where: { id: userHealthConditionId },
      data,
      include: {
        healthCondition: true
      }
    });
  }

  async removeUserHealthCondition(userHealthConditionId: string) {
    if (!userHealthConditionId?.trim()) {
      throw new Error('User health condition ID is required');
    }

    return await prismaClient.userHealthCondition.update({
      where: { id: userHealthConditionId },
      data: { isActive: false }
    });
  }

  async deleteUserHealthCondition(userHealthConditionId: string) {
    if (!userHealthConditionId?.trim()) {
      throw new Error('User health condition ID is required');
    }

    return await prismaClient.userHealthCondition.delete({
      where: { id: userHealthConditionId }
    });
  }

  async findOrCreateHealthCondition(name: string, category: HealthCategory, description?: string) {
    if (!name?.trim()) {
      throw new Error('Health condition name is required');
    }

    let healthCondition = await this.getHealthConditionByName(name);
    
    if (!healthCondition) {
      healthCondition = await this.createHealthCondition({
        name: name.trim(),
        category,
        description: description?.trim()
      });
    }
    
    return healthCondition;
  }
}
