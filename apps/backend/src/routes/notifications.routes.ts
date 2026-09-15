import { FastifyPluginAsync } from 'fastify';
import {
  getAllNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationStats,
  getInstituteNotificationStats,
  createSystemNotification,
  sendBulkNotifications
} from '../controllers/notifications.controller';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import { validateBody, validateParams, validateCUID, validateUserId } from '../middleware/validation.middleware';

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createNotificationSchema = {
    body: {
      type: 'object',
      required: ['title', 'message', 'type', 'recipientId'],
      properties: {
        title: { type: 'string', minLength: 3, maxLength: 200 },
        message: { type: 'string', minLength: 10 },
        type: { type: 'string', enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ANNOUNCEMENT'] },
        priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
        recipientId: { type: 'string' },
        scheduledFor: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
        actionUrl: { type: 'string' },
        actionLabel: { type: 'string' },
        metadata: { type: 'object' }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              type: { type: 'string' },
              priority: { type: 'string' },
              isRead: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  };

  const createSystemNotificationSchema = {
    body: {
      type: 'object',
      required: ['title', 'message', 'type', 'targetRole'],
      properties: {
        title: { type: 'string', minLength: 3, maxLength: 200 },
        message: { type: 'string', minLength: 10 },
        type: { type: 'string', enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ANNOUNCEMENT'] },
        priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
        targetRole: { 
          type: 'string', 
          enum: ['ALL', 'ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'] 
        },
        scheduledFor: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
        actionUrl: { type: 'string' },
        actionLabel: { type: 'string' }
      }
    }
  };

  const bulkNotificationSchema = {
    body: {
      type: 'object',
      required: ['title', 'message', 'type', 'recipients'],
      properties: {
        title: { type: 'string', minLength: 3, maxLength: 200 },
        message: { type: 'string', minLength: 10 },
        type: { type: 'string', enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ANNOUNCEMENT'] },
        priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
        recipients: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1
        },
        scheduledFor: { type: 'string', format: 'date-time' },
        actionUrl: { type: 'string' },
        actionLabel: { type: 'string' }
      }
    }
  };

  const getNotificationsQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        isRead: { type: 'boolean' },
        type: { type: 'string', enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ANNOUNCEMENT'] },
        priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' }
      }
    }
  };

  // Rutas para usuarios autenticados (sus propias notificaciones)
  fastify.get('/my-notifications', {
    schema: { querystring: getNotificationsQuerySchema.querystring },
    preHandler: [authenticate]
  }, async (request, reply) => {
    // Usar el ID del usuario autenticado
    request.params = { userId: request.user!.userId };
    return getUserNotifications(request, reply);
  });

  fastify.get('/my-notifications/stats', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    // Usar el ID del usuario autenticado para estadísticas
    request.params = { userId: request.user!.userId };
    return getNotificationStats(request, reply);
  });

  fastify.patch('/:id/read', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, validateCUID('id')]
  }, markNotificationAsRead);

  fastify.patch('/mark-all-read', {
    preHandler: [authenticate]
  }, markAllNotificationsAsRead);

  // Rutas para administradores y profesores
  fastify.get('/', {
    schema: { querystring: getNotificationsQuerySchema.querystring },
    preHandler: [authenticate, requireTeacher]
  }, getAllNotifications);

  // Las cuentas de TODO el liceo. Las de uno mismo están en
  // `/my-notifications/stats`, que es otra ruta y otra respuesta.
  fastify.get('/stats', {
    preHandler: [authenticate, requireAdmin]
  }, getInstituteNotificationStats);

  fastify.get('/user/:userId', {
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      },
      querystring: getNotificationsQuerySchema.querystring
    },
    preHandler: [authenticate, requireTeacher, validateUserId('userId')]
  }, getUserNotifications);

  fastify.get('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, validateCUID('id')]
  }, getNotificationById);

  // Rutas para crear notificaciones (profesores y administradores)
  fastify.post('/', {
    schema: createNotificationSchema,
    preHandler: [authenticate, requireTeacher]
  }, createNotification);

  fastify.post('/bulk', {
    schema: bulkNotificationSchema,
    preHandler: [authenticate, requireTeacher]
  }, sendBulkNotifications);

  // Rutas para administradores
  fastify.post('/system', {
    schema: createSystemNotificationSchema,
    preHandler: [authenticate, requireAdmin]
  }, createSystemNotification);

  fastify.put('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 200 },
          message: { type: 'string', minLength: 10 },
          type: { type: 'string', enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ANNOUNCEMENT'] },
          priority: { type: 'string', enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] },
          scheduledFor: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          actionUrl: { type: 'string' },
          actionLabel: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin, validateCUID('id')]
  }, updateNotification);

  fastify.delete('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin, validateCUID('id')]
  }, deleteNotification);
};

export default notificationsRoutes;
export { notificationsRoutes };
