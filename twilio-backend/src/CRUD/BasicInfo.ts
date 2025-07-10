import { BasicInfo } from '../types/Types';
import { CheckInFrequency, PrismaClient } from '../../../generated/prisma'

const prismaClient = new PrismaClient()

export class BasicInfoCRUD {
    async createUser(userData: BasicInfo) {
        return await prismaClient.user.create({
            data: {
                fullName: userData.fullName,
                age: userData.age,
                phoneNumber: userData.phoneNumber,
                gender: userData.gender,
                preferredCheckInTime: userData.preferredCheckInTime,
                checkInFrequency: userData.checkInFrequency
            }
        })
    }
    
    async updateUser(field: string, value: any, userId: string) {
        const updateData: BasicInfo = {
            [field]: value
        }

        return await prismaClient.user.update({
            where: { id: userId },
            data: updateData
        })

    }

}