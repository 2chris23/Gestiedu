import { FastifyPluginAsync } from 'fastify';
import {
  getSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getClassroomSchedules,
  getTeacherSchedules
} from '../controllers/schedules.controller';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import { validateBody, validateParams, validateCUID } from '../middleware/validation.middleware';
import { createScheduleSchema as zCreateScheduleSchema, updateScheduleSchema as zUpdateScheduleSchema } from '../utils/validators';

const schedulesRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createScheduleSchema = {
    body: {
      type: 'object',
      required: ['dayOfWeek', 'startTime', 'endTime', 'classroomId', 'subjectId'],
      properties: {
        dayOfWeek: { type: 'string' },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        classroomId: { type: 'string' },
        subjectId: { type: 'string' }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          schedule: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              dayOfWeek: { type: 'string' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  };

  const updateScheduleSchema = {
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
        dayOfWeek: { type: 'string' },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        classroomId: { type: 'string' },
        subjectId: { type: 'string' },
        teacherId: { type: 'string' }
      }
    }
  };

  const getScheduleQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        classroomId: { type: 'string' },
        teacherId: { type: 'string' },
        subjectId: { type: 'string' },
        dayOfWeek: { type: 'string' },
        timeFrom: { type: 'string' },
        timeTo: { type: 'string' }
      }
    }
  };

  // Rutas generales para profesores
  fastify.get('/', {
    schema: { querystring: getScheduleQuerySchema.querystring },
    preHandler: [authenticate, requireTeacher]
  }, getSchedules as any);

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
  }, getSchedule as any);

  // Horarios por aula y profesor
  // NOTA: Esta ruta se movió a scheduleBlocks.routes.ts para mejor organización
  // fastify.get('/classroom/:classroomId', {
  //   schema: {
  //     params: {
  //       type: 'object',
  //       required: ['classroomId'],
  //       properties: { classroomId: { type: 'string' } }
  //     },
  //     querystring: { type: 'object', properties: { dayOfWeek: { type: 'string' } } }
  //   },
  //   preHandler: [authenticate, requireTeacher, validateCUID('classroomId')]
  // }, getClassroomSchedules as any);

  fastify.get('/teacher/:teacherId', {
    schema: {
      params: {
        type: 'object',
        required: ['teacherId'],
        properties: { teacherId: { type: 'string' } }
      }
    },
    preHandler: [authenticate, requireTeacher, validateCUID('teacherId')]
  }, getTeacherSchedules as any);

  // Rutas para crear, actualizar, eliminar
  fastify.post('/', {
    schema: createScheduleSchema,
    preHandler: [authenticate, requireTeacher, validateBody(zCreateScheduleSchema)]
  }, createSchedule as any);

  fastify.put('/:id', {
    schema: updateScheduleSchema,
    preHandler: [authenticate, requireTeacher, validateCUID('id'), validateBody(zUpdateScheduleSchema)]
  }, updateSchedule as any);

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
    preHandler: [authenticate, requireTeacher, validateCUID('id')]
  }, deleteSchedule as any);
};

export default schedulesRoutes;
export { schedulesRoutes };
