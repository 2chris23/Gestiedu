import { UserRole } from '../utils/prisma-enums';
import { PrismaClient } from '@prisma/client';
import { redis } from '../config/redis';
import { sendEmail } from '../utils/email';
import { NotificationType, NotificationPriority, PaginationInput } from '../utils/validators';
import { createError } from '../middleware/error.middleware';

// Tipos locales para notification (reemplazan class-validator DTOs)
interface CreateNotificationData {
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  recipientId: string;
  data?: any;
}

interface UpdateNotificationData {
  title?: string;
  message?: string;
  isRead?: boolean;
}

interface NotificationFilters {
  recipientId?: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  isRead?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

interface BulkNotificationData {
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  recipientIds: string[];
}

interface NotificationData {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  recipientId: string;
  senderId?: string;
  data?: any;
  readAt?: Date | null;
  emailSent?: boolean;
  actionUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationsService {

  // ✅ OPTIMIZADO: Obtener todas las notificaciones del instituto con query directa
  async getAllNotifications(
    prisma: PrismaClient,
    query?: {
      page?: number;
      limit?: number;
      type?: NotificationType;
      priority?: NotificationPriority;
      isRead?: boolean;
      dateFrom?: Date;
      dateTo?: Date;
    }
  ) {
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const skip = (page - 1) * limit;

    // Construir filtros para Prisma
    const where: any = {};

    if (query?.type) where.type = query.type;
    if (query?.priority) where.priority = query.priority;

    if (query?.isRead !== undefined) {
      where.readAt = query.isRead ? { not: null } : null;
    }

    if (query?.dateFrom || query?.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = query.dateFrom;
      if (query.dateTo) where.createdAt.lte = query.dateTo;
    }

    // ✅ 1 sola query en vez de N queries a Redis
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          recipient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      }),
      prisma.notification.count({ where })
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Obtener notificación por ID
  async getNotificationById(prisma: PrismaClient, id: string, userId?: string) {
    const notification = await prisma.notification.findUnique({
      where: { id },
      include: {
        recipient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!notification) return null;
    if (userId && notification.recipientId !== userId) return null;

    return notification;
  }

  // Crear notificación individual
  async create(prisma: PrismaClient, data: CreateNotificationData, senderId?: string): Promise<NotificationData> {
    // Verificar que el destinatario existe
    const recipient = await prisma.user.findUnique({
      where: { id: data.recipientId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true
      }
    });

    if (!recipient || !recipient.isActive) {
      throw createError(404, 'Destinatario no encontrado o inactivo', 'NOT_FOUND');
    }

    // Verificar el remitente si se proporciona
    if (senderId) {
      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: { id: true, isActive: true }
      });

      if (!sender || !sender.isActive) {
        throw createError(404, 'Remitente no encontrado o inactivo', 'NOT_FOUND');
      }
    }

    // Crear la notificación en la base de datos
    const notification = await prisma.notification.create({
      data: {
        title: data.title,
        message: data.message,
        type: data.type as string,
        priority: (data.priority as string) || NotificationPriority.MEDIUM,
        recipientId: data.recipientId,
        senderId,
        data: data.data ? JSON.stringify(data.data) as any : null,
        actionUrl: (data as any).actionUrl
      }
    });

    // Enviar email si la prioridad es alta o urgente
    if ([NotificationPriority.HIGH, NotificationPriority.URGENT].includes(data.priority as NotificationPriority)) {
      try {
        await sendEmail({
          to: recipient.email,
          subject: data.title,
          text: data.message,
          html: undefined
        });

        // Actualizar emailSent
        await prisma.notification.update({
          where: { id: notification.id },
          data: { emailSent: true }
        });
      } catch (error) {
        console.error('Error enviando email de notificación:', error);
      }
    }

    return notification as NotificationData;
  }

  // ✅ OPTIMIZADO: Crear notificaciones masivas con batch insert
  async createBulk(
    prisma: PrismaClient,
    recipientIds: string[],
    notificationData: Omit<CreateNotificationData, 'recipientId'>,
    senderId?: string
  ): Promise<{ sent: number; failed: string[] }> {
    // Verificar que todos los destinatarios existen y están activos
    const recipients = await prisma.user.findMany({
      where: {
        id: { in: recipientIds },
        isActive: true
      },
      select: {
        id: true,
        email: true
      }
    });

    const validRecipientIds = recipients.map(r => r.id);
    const failed = recipientIds.filter(id => !validRecipientIds.includes(id));

    if (validRecipientIds.length === 0) {
      return { sent: 0, failed: recipientIds };
    }

    try {
      // ✅ Batch insert con createMany
      await prisma.notification.createMany({
        data: validRecipientIds.map(recipientId => {
          const recipient = recipients.find(r => r.id === recipientId)!;
          return {
            title: notificationData.title,
            message: notificationData.message,
            type: notificationData.type as string,
            priority: (notificationData.priority as string) || NotificationPriority.MEDIUM,
            recipientId,
            senderId,
            data: notificationData.data ? JSON.stringify(notificationData.data) as any : null,
            actionUrl: (notificationData as any).actionUrl
          };
        })
      });

      // Enviar emails en paralelo si es necesario
      if ([NotificationPriority.HIGH, NotificationPriority.URGENT].includes(notificationData.priority as NotificationPriority)) {
        const emailPromises = recipients.map(recipient =>
          sendEmail({
            to: recipient.email,
            subject: notificationData.title,
            text: notificationData.message,
            html: undefined
          }).catch(err => console.error(`Error sending email to ${recipient.email}:`, err))
        );

        await Promise.all(emailPromises);
      }

      return { sent: validRecipientIds.length, failed };
    } catch (error) {
      console.error('Error creating bulk notifications:', error);
      return { sent: 0, failed: recipientIds };
    }
  }

  // Obtener notificaciones de un usuario
  async getUserNotifications(
    db: PrismaClient,
    userId: string,
    filters?: NotificationFilters,
    pagination?: PaginationInput
  ) {
    const client = db;

    // Verificar que el usuario existe
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true }
    });

    if (!user || !user.isActive) {
      throw createError(404, 'Usuario no encontrado o inactivo', 'NOT_FOUND');
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { recipientId: userId };

    if (filters?.type) where.type = filters.type;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.isRead !== undefined) {
      where.readAt = filters.isRead ? { not: null } : null;
    }
    if ((filters as any)?.dateFrom) {
      where.createdAt = { ...where.createdAt, gte: (filters as any).dateFrom };
    }
    if ((filters as any)?.dateTo) {
      where.createdAt = { ...where.createdAt, lte: (filters as any).dateTo };
    }

    const [notifications, total, unreadCount] = await Promise.all([
      client.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      client.notification.count({ where }),
      client.notification.count({
        where: { recipientId: userId, readAt: null }
      })
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      unreadCount
    };
  }

  // Marcar notificación como leída
  async markAsRead(prisma: PrismaClient, notificationId: string, userId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      throw createError(404, 'Notificación no encontrada', 'NOT_FOUND');
    }

    if (notification.recipientId !== userId) {
      throw createError(403, 'No tienes permisos para marcar esta notificación', 'FORBIDDEN');
    }

    if (notification.readAt) {
      return notification;
    }

    return await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() }
    });
  }

  // Marcar todas las notificaciones como leídas
  async markAllAsRead(prisma: PrismaClient, userId: string): Promise<{ marked: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true }
    });

    if (!user || !user.isActive) {
      throw createError(404, 'Usuario no encontrado o inactivo', 'NOT_FOUND');
    }

    const result = await prisma.notification.updateMany({
      where: {
        recipientId: userId,
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    });

    return { marked: result.count };
  }

  // Eliminar notificación
  async delete(prisma: PrismaClient, notificationId: string, userId: string): Promise<{ message: string }> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      throw createError(404, 'Notificación no encontrada', 'NOT_FOUND');
    }

    if (notification.recipientId !== userId) {
      throw createError(403, 'No tienes permisos para eliminar esta notificación', 'FORBIDDEN');
    }

    await prisma.notification.delete({
      where: { id: notificationId }
    });

    return { message: 'Notificación eliminada correctamente' };
  }

  // Eliminar todas las notificaciones de un usuario
  async deleteAll(prisma: PrismaClient, userId: string): Promise<{ deleted: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true }
    });

    if (!user || !user.isActive) {
      throw createError(404, 'Usuario no encontrado o inactivo', 'NOT_FOUND');
    }

    const result = await prisma.notification.deleteMany({
      where: { recipientId: userId }
    });

    return { deleted: result.count };
  }

  // Obtener estadísticas de notificaciones del usuario
  async getUserStats(prisma: PrismaClient, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true }
    });

    if (!user || !user.isActive) {
      throw createError(404, 'Usuario no encontrado o inactivo', 'NOT_FOUND');
    }

    const [total, unread, byType, byPriority, emailsSent] = await Promise.all([
      prisma.notification.count({ where: { recipientId: userId } }),
      prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
      prisma.notification.groupBy({
        by: ['type'],
        where: { recipientId: userId },
        _count: { id: true }
      }),
      prisma.notification.groupBy({
        by: ['priority'],
        where: { recipientId: userId },
        _count: { id: true }
      }),
      prisma.notification.count({ where: { recipientId: userId, emailSent: true } })
    ]);

    const typeStats = byType.reduce((acc, item) => {
      acc[item.type] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    const priorityStats = byPriority.reduce((acc, item) => {
      acc[item.priority] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      unread,
      read: total - unread,
      byType: typeStats,
      byPriority: priorityStats,
      emailsSent
    };
  }

  // Limpiar notificaciones antiguas (job de mantenimiento)
  async cleanupOldNotifications(prisma: PrismaClient, daysOld: number = 30): Promise<{ cleaned: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: { lte: cutoffDate },
        readAt: { not: null }
      }
    });

    return { cleaned: result.count };
  }

  // Crear notificación del sistema
  async createSystemNotification(prisma: PrismaClient, data: {
    title: string;
    message: string;
    type: NotificationType;
    priority?: NotificationPriority;
    senderId?: string;
    targetRoles?: UserRole[];
  }) {
    const priority = data.priority || NotificationPriority.MEDIUM;
    const where: any = { isActive: true };

    if (data.targetRoles && data.targetRoles.length) {
      where.role = { in: data.targetRoles };
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true }
    });

    if (users.length === 0) {
      return { sent: 0, failed: [] };
    }

    return await this.createBulk(
      prisma,
      users.map(u => u.id),
      {
        title: data.title,
        message: data.message,
        type: data.type,
        priority
      },
      data.senderId
    );
  }

  // Enviar notificaciones masivas
  async sendBulkNotifications(prisma: PrismaClient, data: BulkNotificationData & { senderId?: string }) {
    return await this.createBulk(
      prisma,
      data.recipientIds,
      {
        title: data.title,
        message: data.message,
        type: data.type,
        priority: data.priority
      },
      data.senderId
    );
  }

  // Aliases para alinear con el controlador
  async createNotification(prisma: PrismaClient, data: any) {
    const { senderId, ...rest } = data || {};
    return this.create(prisma, rest as CreateNotificationData, senderId);
  }

  async getNotificationStats(prisma: PrismaClient, userId: string) {
    return this.getUserStats(prisma, userId);
  }

  // Operaciones a nivel de instituto (admin)
  async updateNotification(prisma: PrismaClient, id: string, data: UpdateNotificationData) {
    const notification = await prisma.notification.findUnique({
      where: { id }
    });

    if (!notification) {
      throw createError(404, 'Notificación no encontrada', 'NOT_FOUND');
    }


    const updateData: any = {};
    if (typeof data.title === 'string') updateData.title = data.title;
    if (typeof data.message === 'string') updateData.message = data.message;
    if (typeof (data as any).actionUrl === 'string') updateData.actionUrl = (data as any).actionUrl;
    if (typeof data.isRead === 'boolean') {
      updateData.readAt = data.isRead ? (notification.readAt || new Date()) : null;
    }

    return await prisma.notification.update({
      where: { id },
      data: updateData
    });
  }

  async deleteNotification(prisma: PrismaClient, id: string) {
    const notification = await prisma.notification.findUnique({
      where: { id }
    });

    if (!notification) {
      throw createError(404, 'Notificación no encontrada', 'NOT_FOUND');
    }


    await prisma.notification.delete({
      where: { id }
    });

    return { message: 'Notificación eliminada correctamente' };
  }
}

export const notificationsService = new NotificationsService();
