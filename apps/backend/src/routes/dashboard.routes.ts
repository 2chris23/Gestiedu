import { FastifyPluginAsync } from 'fastify';
import {
  getAdminDashboard,
  getTeacherDashboard,
  getStudentDashboard,
  getTutorDashboard,
  getSystemStats,
  getInstituteStats,
  getRecentActivity,
  getUpcomingEvents,
  getPerformanceMetrics
} from '../controllers/dashboard.controller';
import { authenticate, requireAdmin, requireTeacher, requireStudent, requireTutor } from '../middleware/auth.middleware';

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const dashboardQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        period: { 
          type: 'string', 
          enum: ['week', 'month', 'quarter', 'year'],
          default: 'month'
        },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' }
      }
    }
  };

  const statsQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        period: { 
          type: 'string', 
          enum: ['week', 'month', 'quarter', 'year'],
          default: 'month'
        },
        groupBy: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          default: 'day'
        },
        includeInactive: { type: 'boolean', default: false }
      }
    }
  };

  // Dashboard específico por rol
  fastify.get('/admin', {
    schema: { querystring: dashboardQuerySchema.querystring },
    preHandler: [authenticate, requireAdmin]
  }, getAdminDashboard);

  fastify.get('/teacher', {
    schema: { querystring: dashboardQuerySchema.querystring },
    preHandler: [authenticate, requireTeacher]
  }, getTeacherDashboard);

  fastify.get('/student', {
    schema: { querystring: dashboardQuerySchema.querystring },
    preHandler: [authenticate, requireStudent]
  }, getStudentDashboard);

  fastify.get('/tutor', {
    schema: { querystring: dashboardQuerySchema.querystring },
    preHandler: [authenticate, requireTutor]
  }, getTutorDashboard);

  // Estadísticas del sistema
  fastify.get('/stats/system', {
    schema: { querystring: statsQuerySchema.querystring },
    preHandler: [authenticate, requireAdmin]
  }, getSystemStats);

  fastify.get('/stats/institute', {
    schema: { querystring: statsQuerySchema.querystring },
    preHandler: [authenticate, requireAdmin]
  }, getInstituteStats);

  // Actividad reciente
  fastify.get('/activity/recent', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          type: { 
            type: 'string', 
            enum: ['all', 'grades', 'attendance', 'activities', 'users']
          }
        }
      }
    },
    preHandler: [authenticate]
  }, getRecentActivity);

  // Eventos próximos
  fastify.get('/events/upcoming', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          days: { type: 'integer', minimum: 1, maximum: 365, default: 30 }
        }
      }
    },
    preHandler: [authenticate]
  }, getUpcomingEvents);

  // Métricas de rendimiento
  fastify.get('/metrics/performance', {
    schema: { querystring: dashboardQuerySchema.querystring },
    preHandler: [authenticate, requireTeacher]
  }, getPerformanceMetrics);

  // Dashboard general (redirige según el rol)
  fastify.get('/', {
    schema: { querystring: dashboardQuerySchema.querystring },
    preHandler: [authenticate]
  }, async (request, reply) => {
    const userRole = request.user?.role;
    
    switch (userRole) {
      case 'ADMIN':
        return getAdminDashboard(request, reply);
      case 'TEACHER':
        return getTeacherDashboard(request, reply);
      case 'STUDENT':
        return getStudentDashboard(request, reply);
      case 'TUTOR':
        return getTutorDashboard(request, reply);
      default:
        return reply.status(403).send({
          success: false,
          message: 'Rol no autorizado para acceder al dashboard'
        });
    }
  });
};

export default dashboardRoutes;
export { dashboardRoutes };
