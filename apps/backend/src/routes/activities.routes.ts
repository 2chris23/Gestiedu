import { FastifyPluginAsync } from 'fastify';
import {
  getActivities,
  getActivity,
  createActivity,
  updateActivity,
  deleteActivity
} from '../controllers/activities.controller';
import { authenticate, requireAdmin, requireTeacher, requireStudent } from '../middleware/auth.middleware';
import { validateBody, validateCUID } from '../middleware/validation.middleware';
import * as validators from '../utils/validators';

const activitiesRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createActivitySchema = {
    schema: {
      body: {
        type: 'object',
        required: ['title', 'description', 'type', 'dueDate', 'maxScore', 'subjectId'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 200 },
          description: { type: 'string', minLength: 10 },
          type: { type: 'string', enum: ['TAREA', 'EXAMEN', 'PROYECTO', 'LABORATORIO', 'ENSAYO', 'PRESENTACION', 'OTRO'] },
          dueDate: { type: 'string', format: 'date-time' },
          maxScore: { type: 'number', minimum: 0, maximum: 20 },
          subjectId: { type: 'string' },
          classroomId: { type: 'string' },
          instructions: { type: 'string' },
          attachments: {
            type: 'array',
            items: { type: 'string' }
          },
          isVisible: { type: 'boolean', default: true }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            activity: {
              type: 'object',
              additionalProperties: true
            },
            data: {
              type: 'object',
              additionalProperties: true
            }
          }
        }
      }
    }
  };

  const updateActivitySchema = {
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
          description: { type: 'string', minLength: 10 },
          type: { type: 'string', enum: ['TAREA', 'EXAMEN', 'PROYECTO', 'LABORATORIO', 'ENSAYO', 'PRESENTACION', 'OTRO'] },
          dueDate: { type: 'string', format: 'date-time' },
          maxScore: { type: 'number', minimum: 0, maximum: 20 },
          instructions: { type: 'string' },
          isVisible: { type: 'boolean' }
        }
      }
    }
  };

  const getActivitiesQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        subjectId: { type: 'string' },
        classroomId: { type: 'string' },
        type: { type: 'string', enum: ['TAREA', 'EXAMEN', 'PROYECTO', 'LABORATORIO', 'ENSAYO', 'PRESENTACION', 'OTRO'] },
        status: { type: 'string', enum: ['PENDIENTE', 'COMPLETADA', 'VENCIDA'] },
        search: { type: 'string' }
      }
    }
  };

  // Thin wrappers to reuse getActivities with path params
  const getActivitiesBySubjectWrapper = async (req: any, reply: any) => {
    req.query = { ...(req.query || {}), subjectId: req.params.subjectId };
    return getActivities(req as any, reply);
  };

  const getActivitiesByClassroomWrapper = async (req: any, reply: any) => {
    req.query = { ...(req.query || {}), classroomId: req.params.classroomId };
    return getActivities(req as any, reply);
  };

  const getStudentActivitiesWrapper = async (req: any, reply: any) => {
    return getActivities(req as any, reply);
  };

  // Rutas generales (profesores y administradores)
  fastify.get('/', {
    schema: { querystring: getActivitiesQuerySchema.querystring },
    preHandler: [authenticate, requireTeacher]
  }, getActivities as any);

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
  }, getActivity as any);

  fastify.get('/subject/:subjectId', {
    schema: {
      params: {
        type: 'object',
        required: ['subjectId'],
        properties: {
          subjectId: { type: 'string' }
        }
      },
      querystring: getActivitiesQuerySchema.querystring
    },
    preHandler: [authenticate, validateCUID('subjectId')]
  }, getActivitiesBySubjectWrapper as any);

  fastify.get('/classroom/:classroomId', {
    schema: {
      params: {
        type: 'object',
        required: ['classroomId'],
        properties: {
          classroomId: { type: 'string' }
        }
      },
      querystring: getActivitiesQuerySchema.querystring
    },
    preHandler: [authenticate, validateCUID('classroomId')]
  }, getActivitiesByClassroomWrapper as any);

  // Rutas para profesores
  fastify.post('/', {
    schema: createActivitySchema.schema,
    preHandler: [authenticate, requireTeacher, validateBody(validators.createActivitySchema)]
  }, createActivity as any);

  fastify.put('/:id', {
    schema: updateActivitySchema.schema,
    preHandler: [authenticate, requireTeacher, validateCUID('id'), validateBody(validators.updateActivitySchema)]
  }, updateActivity as any);

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
  }, deleteActivity as any);

  // Rutas para estudiantes
  fastify.get('/student/my-activities', {
    schema: { querystring: getActivitiesQuerySchema.querystring },
    preHandler: [authenticate, requireStudent]
  }, getStudentActivitiesWrapper as any);
};

export default activitiesRoutes;
export { activitiesRoutes };
