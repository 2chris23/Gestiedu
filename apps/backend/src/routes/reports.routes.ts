import { FastifyPluginAsync } from 'fastify';
import {
  generateGradeReport,
  generateAttendanceReport,
  generateStudentReport,
  getGradeAnalytics,
} from '../controllers/reports.controller';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import { validateCUID } from '../middleware/validation.middleware';

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const gradeReportBodySchema = {
    body: {
      type: 'object',
      required: ['studentId', 'periodId'],
      properties: {
        studentId: { type: 'string' },
        periodId: { type: 'string' },
      }
    }
  };

  const attendanceQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        classroomId: { type: 'string' },
        studentId: { type: 'string' },
        dateFrom: { type: 'string', format: 'date' },
        dateTo: { type: 'string', format: 'date' },
      }
    }
  };

  const gradeAnalyticsQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        periodId: { type: 'string' },
        subjectId: { type: 'string' },
        classroomId: { type: 'string' },
      }
    }
  };


  // Reporte de calificaciones (usa body: studentId, periodId)
  fastify.post('/grades', {
    schema: gradeReportBodySchema,
    preHandler: [authenticate, requireTeacher]
  }, generateGradeReport as any);

  // Reportes de asistencia (usa query: page, limit, classroomId, studentId, dateFrom, dateTo)
  fastify.get('/attendance', {
    schema: attendanceQuerySchema,
    preHandler: [authenticate, requireTeacher]
  }, generateAttendanceReport as any);

  // Analítica de calificaciones
  fastify.get('/analytics/grades', {
    schema: gradeAnalyticsQuerySchema,
    preHandler: [authenticate, requireTeacher]
  }, getGradeAnalytics as any);

  // Reporte consolidado de estudiante
  fastify.get('/student/:studentId', {
    schema: {
      params: {
        type: 'object',
        required: ['studentId'],
        properties: {
          studentId: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, validateCUID('studentId')]
  }, generateStudentReport as any);

  // Nota: Rutas de plantillas y otros reportes especializados se eliminan por falta de controladores exportados
};

export default reportsRoutes;
export { reportsRoutes };
