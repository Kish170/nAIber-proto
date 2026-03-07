import { prismaClient } from '@naiber/shared-clients';
import type { NotificationType } from '../../../../generated/prisma/index.js';

export interface NotificationCreateData {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: object;
}

export class NotificationRepository {
    static async create(data: NotificationCreateData) {
        try {
            return await prismaClient.notification.create({ data });
        } catch (error) {
            console.error('[NotificationRepository] Error creating notification:', error);
            throw error;
        }
    }

    static async findByUserId(userId: string, options?: { limit?: number; offset?: number; unreadOnly?: boolean }) {
        try {
            return await prismaClient.notification.findMany({
                where: {
                    userId,
                    ...(options?.unreadOnly ? { readAt: null } : {}),
                },
                orderBy: { createdAt: 'desc' },
                take: options?.limit ?? 20,
                skip: options?.offset ?? 0,
            });
        } catch (error) {
            console.error('[NotificationRepository] Error finding notifications:', error);
            throw error;
        }
    }

    static async markAsRead(notificationId: string) {
        try {
            return await prismaClient.notification.update({
                where: { id: notificationId },
                data: { readAt: new Date() },
            });
        } catch (error) {
            console.error('[NotificationRepository] Error marking notification as read:', error);
            throw error;
        }
    }

    static async getUnreadCount(userId: string): Promise<number> {
        try {
            return await prismaClient.notification.count({
                where: { userId, readAt: null },
            });
        } catch (error) {
            console.error('[NotificationRepository] Error getting unread count:', error);
            throw error;
        }
    }
}
