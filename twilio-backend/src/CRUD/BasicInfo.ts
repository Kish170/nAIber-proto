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

    async getUserID(conversationId: string) {
        const user = await prismaClient.user.findUniqueOrThrow({
            where: { conversationID: conversationId },
            select: { id: true }
        })
        return user.id
    }
}