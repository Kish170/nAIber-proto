import { BasicInfo } from '../utils/types/Types';
import { PrismaClient } from '../../../generated/prisma'

export class BasicInfoTools {
    private readonly prismaClient = new PrismaClient();
    async createUser(userData: BasicInfo) {
        return await this.prismaClient.user.create({
            data: {
                fullName: userData.fullName,
                conversationID: userData.conversationID
            }
        })
    }
    
    async updateUser(field: string, value: any, conversationId: string) {
        return await this.prismaClient.user.update({
            where: { conversationID: conversationId },
            data: { [field]: value }
        })
    }

    async getUserID(identifier: { conversationId: string } | { phoneNumber: string }): Promise<string> {
        if ('conversationId' in identifier) {
            const user = await this.prismaClient.user.findUniqueOrThrow({
                where: { conversationID: identifier.conversationId },
                select: { id: true }
            })
            return user.id
        } 

        if ('phoneNumber' in identifier) {
            const user = await this.prismaClient.user.findUniqueOrThrow({
                where: { phoneNumber: identifier.phoneNumber },
                select: { id: true }
            })
            return user.id
        } 
        
        throw new Error('Invalid identifier provided')
    }

    async getAllUserInfo(userId: string) {
        return await this.prismaClient.user.findFirst({
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

    async getUserPersonalization(userId: string) {
        return await this.prismaClient.user.findUnique({
            where: { id: userId },
            select: {
                hobbiesInterests: true,
                favoriteTopics: true,
                likes: true,
                dislikes: true,
                dailyRoutine: true
            }
        })
    }

    async updatePersonalizationField(userId: string, field: string, value: any) {
        return await this.prismaClient.user.update({
            where: { id: userId },
            data: { [field]: value }
        })
    }

    // Generic helper for array operations
    private async updateUserArray(
        userId: string, 
        field: 'hobbiesInterests' | 'favoriteTopics' | 'likes' | 'dislikes',
        item: string,
        operation: 'add' | 'remove'
    ) {
        if (!item?.trim()) {
            throw new Error(`${field.slice(0, -1)} cannot be empty`)
        }

        const user = await this.prismaClient.user.findUnique({
            where: { id: userId },
            select: { [field]: true }
        })
        
        if (!user) {
            throw new Error('User not found')
        }

        const currentItems = (user as any)[field] || []
        let updatedItems: string[]

        if (operation === 'add') {
            if (currentItems.includes(item)) {
                return user // Item already exists, return current state
            }
            updatedItems = [...currentItems, item]
        } else {
            updatedItems = currentItems.filter((i: string) => i !== item)
        }
        
        return await this.prismaClient.user.update({
            where: { id: userId },
            data: { [field]: updatedItems }
        })
    }

    async addHobbyInterest(userId: string, hobby: string) {
        return await this.updateUserArray(userId, 'hobbiesInterests', hobby, 'add')
    }

    async addFavoriteTopic(userId: string, topic: string) {
        return await this.updateUserArray(userId, 'favoriteTopics', topic, 'add')
    }

    async addLikeDislike(userId: string, item: string, type: 'like' | 'dislike') {
        const fieldName = type === 'like' ? 'likes' : 'dislikes'
        return await this.updateUserArray(userId, fieldName, item, 'add')
    }

    async removeHobbyInterest(userId: string, hobby: string) {
        return await this.updateUserArray(userId, 'hobbiesInterests', hobby, 'remove')
    }

    async removeFavoriteTopic(userId: string, topic: string) {
        return await this.updateUserArray(userId, 'favoriteTopics', topic, 'remove')
    }

    async removeLikeDislike(userId: string, item: string, type: 'like' | 'dislike') {
        const fieldName = type === 'like' ? 'likes' : 'dislikes'
        return await this.updateUserArray(userId, fieldName, item, 'remove')
    }
}