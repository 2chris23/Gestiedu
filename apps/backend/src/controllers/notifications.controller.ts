/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { NotificationsService } from '../services/notifications.service';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../utils/constants';
import { createError } from '../middleware/error.middleware';
import { NotificationType, NotificationPriority } from '../utils/validators';

// Reemplaza NotificationFiltersDto de class-validator
interface NotificationFilters {
  recipientId?: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  isRead?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

const notificationsService = new NotificationsService();

export async function getAllNotifications(request: FastifyRequest, reply: FastifyReply) {
  try {
    const query = request.query as any;
    // Mapear query a filtros esperados por el servicio
    const mapped = {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      type: query.type as NotificationType | undefined,
      priority: query.priority as NotificationPriority | undefined,
      isRead: typeof query.isRead !== 'undefined' ? (query.isRead === 'true' || query.isRead === true) : undefined,
      dateFrom: query.startDate ? new Date(query.startDate) : undefined,
      dateTo: query.endDate ? new Date(query.endDate) : undefined,
    };
    const result = await notificationsService.getAllNotifications(request.tenantPrisma, mapped);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: result.notifications,
      pagination: result.pagination
    });
  } catch (error) {
    throw error;
  }
}

export async function getNotificationById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const userId = request.user?.userId;
    const notification = await notificationsService.getNotificationById(request.tenantPrisma, id, userId!);

    if (!notification) {
      throw createError(404, ERROR_MESSAGES.RECORD_NOT_FOUND);
    }

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: notification
    });
  } catch (error) {
    throw error;
  }
}

export async function createNotification(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = request.body as any;
    const senderId = request.user?.userId;

    const notification = await notificationsService.createNotification(
      request.tenantPrisma,
      {
        ...data,
        senderId
      }
    );

    return reply.status(201).send({
      success: true,
      message: SUCCESS_MESSAGES.CREATE_SUCCESS,
      data: notification
    });
  } catch (error) {
    throw error;
  }
}

export async function createSystemNotification(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = request.body as any;
    const senderId = request.user?.userId;

    const result = await notificationsService.createSystemNotification(
      request.tenantPrisma,
      {
        ...data,
        senderId
      }
    );

    return reply.status(201).send({
      success: true,
      message: `${result.sent} notificaciones creadas exitosamente`,
      data: { count: result.sent, result }
    });
  } catch (error) {
    throw error;
  }
}

export async function sendBulkNotifications(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = request.body as any;
    const senderId = request.user?.userId;

    // La ruta publica el campo como `recipients` y el servicio lo esperaba como
    // `recipientIds`: llegaba vacío y la petición reventaba con un 500. Se aceptan
    // los dos nombres y se avisa claro si no viene ninguno.
    const destinatarios: string[] = data?.recipients ?? data?.recipientIds ?? [];
    if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
      return reply.status(400).send({
        error: 'Hace falta al menos un destinatario',
        code: 'SIN_DESTINATARIOS',
      });
    }

    const result = await notificationsService.sendBulkNotifications(
      request.tenantPrisma,
      {
        ...data,
        recipientIds: destinatarios,
        senderId
      }
    );

    return reply.status(201).send({
      success: true,
      message: `${result.sent} notificaciones enviadas exitosamente`,
      data: { count: result.sent, result }
    });
  } catch (error) {
    throw error;
  }
}

export async function updateNotification(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const data = request.body as any;
    const notification = await notificationsService.updateNotification(request.tenantPrisma, id, data);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.UPDATE_SUCCESS,
      data: notification
    });
  } catch (error) {
    throw error;
  }
}

export async function deleteNotification(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    await notificationsService.deleteNotification(request.tenantPrisma, id);

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.DELETE_SUCCESS
    });
  } catch (error) {
    throw error;
  }
}

export async function getUserNotifications(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { userId } = request.params as { userId?: string };
    const query = request.query as any;
    const actualUserId = userId || request.user?.userId;
    // Mapear query
    const filters: NotificationFilters = {
      type: query.type,
      priority: query.priority,
      isRead: typeof query.isRead !== 'undefined' ? (query.isRead === 'true' || query.isRead === true) : undefined,
      dateFrom: query.startDate,
      dateTo: query.endDate,
    } as any;
    const pagination = {
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
    } as any;

    const result = await notificationsService.getUserNotifications(
      request.tenantPrisma,
      actualUserId!, filters, pagination
    );

    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: result.notifications,
      pagination: result.pagination
    });
  } catch (error) {
    throw error;
  }
}

export async function markNotificationAsRead(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const userId = request.user?.userId!;
    const notification = await notificationsService.markAsRead(request.tenantPrisma, id, userId);
    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.UPDATE_SUCCESS,
      data: notification,
    });
  } catch (error) {
    throw error;
  }
}

export async function markAllNotificationsAsRead(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = request.user?.userId!;
    const result = await notificationsService.markAllAsRead(request.tenantPrisma, userId);
    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.UPDATE_SUCCESS,
      data: result,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Las cuentas de TODO el liceo. Solo el admin.
 *
 * Antes esta ruta devolvía las del propio admin aunque su comentario dijera
 * "globales del sistema". Ver `notificationsService.getInstituteStats`.
 */
export async function getInstituteNotificationStats(request: FastifyRequest, reply: FastifyReply) {
  const stats = await notificationsService.getInstituteStats(request.tenantPrisma);
  return reply.status(200).send({
    success: true,
    message: SUCCESS_MESSAGES.FETCH_SUCCESS,
    data: stats,
  });
}

export async function getNotificationStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { userId } = request.params as { userId?: string };
    const actualUserId = userId || request.user?.userId!;
    const stats = await notificationsService.getNotificationStats(request.tenantPrisma, actualUserId);
    return reply.status(200).send({
      success: true,
      message: SUCCESS_MESSAGES.FETCH_SUCCESS,
      data: stats,
    });
  } catch (error) {
    throw error;
  }
}
