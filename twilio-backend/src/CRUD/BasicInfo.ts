import { BasicInfo } from '../types/Types';
import { PrismaClient, User } from '../../../generated/prisma'

const prismaClient = new PrismaClient()

export class BasicInfoCRUD {
    async createUser(userData: BasicInfo) {
        return await prismaClient.user.create({
            data: {
                fullName: userData.fullName!,
                conversationID: userData.conversationID!
            }
        })
    }
    
    async updateUser(field: string, value: any, conversationId: string) {
        const updateData: Partial<User> = {
            [field]: value
        }

        return await prismaClient.user.update({
            where: { conversationID: conversationId },
            data: updateData
        })
    }

    async getUserID(identifier: { conversationId: string } | { phoneNumber: string }) {
        if ('conversationId' in identifier) {
            const user = await prismaClient.user.findUniqueOrThrow({
                where: { conversationID: identifier.conversationId },
                select: { id: true }
            })
            return user.id
        } 

        if ('phoneNumber' in identifier) {
            const user = await prismaClient.user.findUniqueOrThrow({
                where: { phoneNumber: identifier.phoneNumber },
                select: { id: true }
            })
            return user.id
        } 
        
    }

    async getAllUserInfo(userId: string) {
        return await prismaClient.user.findFirst({
            where: { id: userId }, 
            include: {
              emergencyContacts: true,
              healthConditions: {
                  include: {
                      healthCondition: true
                  }
              },
              medications: {
                  include: {
                      medication: true
                  }
              }
          }
        })
    }
}