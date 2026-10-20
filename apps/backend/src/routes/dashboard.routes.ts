import { FastifyPluginAsync } from 'fastify';
import {
  getAdminDashboard,
  getTeacherDashboard,
  getStudentDashboard,
  getTutorDashboard,
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
