import { BasicInfo } from '../utils/types/Types';
import { PrismaClient } from '../../../generated/prisma';
import { userContextManager } from '../utils/UserContext';

export class BasicInfoTools {
    private readonly prismaClient = new PrismaClient();
    async createUser(userData: BasicInfo) {
        const user = await this.prismaClient.user.create({
            data: {
                fullName: userData.fullName,
                conversationID: userData.conversationID
            }
        });

        // Update user context when user is created during onboarding
        console.log('[UserContext] Updating context with new user ID during onboarding');

        // Update context by conversationID with the new user ID
        const conversationContext = userContextManager.getContextByConversation(userData.conversationID);
        if (conversationContext && conversationContext.userId === 'PENDING') {
            conversationContext.updateUserId(user.id);
            conversationContext.updateFullName(userData.fullName);
            console.log('[UserContext] ✅ Updated context with new user ID and name');
        }

        return user;
    }
    
    async updateUser(field: string, value: any, conversationId: string) {
        const result = await this.prismaClient.user.update({
            where: { conversationID: conversationId },
            data: { [field]: value }
        });

        // Update user context when phone number is updated
        if (field === 'phoneNumber') {
            console.log(`[UserContext] Phone number updated to: ${value}`);

            // Get current context by conversationId
            const conversationContext = userContextManager.getContextByConversation(conversationId);
            if (conversationContext) {
                // Update phone number in the conversation context
                conversationContext.phoneNumber = value;

                // Create/update context by phone number for easy lookup
                await userContextManager.setContext(value, {
                    userId: conversationContext.userId,
                    conversationID: conversationContext.conversationID,
                    lastConversationId: conversationContext.lastConversationId,
                    phoneNumber: value,
                    fullName: conversationContext.fullName
                });

                console.log(`[UserContext] ✅ Updated phone number context to: ${value}`);
            }
        }

        return result;
    }

    async getUserID(identifier: { conversationId: string } | { phoneNumber: string }): Promise<string | null> {
        // Try to get from cache first
        if ('conversationId' in identifier) {
            const cachedContext = userContextManager.getContextByConversation(identifier.conversationId);
            if (cachedContext && cachedContext.userId !== 'PENDING') {
                console.log('[UserContext] ✅ Found userId in cache by conversationId');
                return cachedContext.userId;
            }

            // Fallback to database
            console.log('[UserContext] Cache miss, querying database for conversationId');
            const user = await this.prismaClient.user.findUnique({
                where: { conversationID: identifier.conversationId },
                select: { id: true }
            });
            return user?.id || null;
        }

        if ('phoneNumber' in identifier) {
            const cachedContext = userContextManager.getContextByPhone(identifier.phoneNumber);
            if (cachedContext && cachedContext.userId !== 'PENDING') {
                console.log('[UserContext] ✅ Found userId in cache by phoneNumber');
                return cachedContext.userId;
            }

            // Fallback to database
            console.log('[UserContext] Cache miss, querying database for phoneNumber');
            const user = await this.prismaClient.user.findUnique({
                where: { phoneNumber: identifier.phoneNumber },
                select: { id: true }
            });
            return user?.id || null;
        }

        throw new Error('Invalid identifier provided');
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
                topics: {
                    include: {
                        topic: true
                    }
                },
                preferences: {
                    include: {
                        preference: true
                    }
                },
                dailyRoutine: true,
                lastConversationId: true
            }
        })
    }

    async updatePersonalizationField(userId: string, field: string, value: any) {
        return await this.prismaClient.user.update({
            where: { id: userId },
            data: { [field]: value }
        })
    }

    async updateConversationId(userId: string, newConversationId: string) {
        return await this.prismaClient.user.update({
            where: { id: userId },
            data: { conversationID: newConversationId }
        })
    }
}