import { FastifyPluginAsync } from 'fastify';
import {
  createGrade,
  updateGrade,
  deleteGrade,
  getStudentGrades,
  bulkCreateGrades,
  getGrades,
  getGrade,
} from '../controllers/grades.controller';
import { authenticate, requireTeacher, requireStudent, requireSelfOrAdmin } from '../middleware/auth.middleware';
import { validateBody, validateCUID } from '../middleware/validation.middleware';
import validators from '../utils/validators';

const gradesRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createGradeSchema = {
    body: {
      type: 'object',
      required: ['score', 'activityId', 'studentId', 'periodId', 'subjectId'],
      properties: {
        score: { type: 'number', minimum: 0, maximum: 20 },
        activityId: { type: 'string' },
        studentId: { type: 'string' },
        periodId: { type: 'string' },
        subjectId: { type: 'string' },
        feedback: { type: 'string' },
        comments: { type: 'string' },
        gradedAt: { type: 'string', format: 'date-time' }
      }
    },
    // BUG FIX: el response schema declaraba `{ success, message, data }`, pero el
    // controlador devuelve `{ grade }`. Fastify serializaba la respuesta a {}
    // y el frontend recibía un objeto vacío. Se elimina el response schema
    // para que Fastify no filtre la respuesta real.
  };

  const updateGradeSchema = {
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
        score: { type: 'number', minimum: 0, maximum: 20 },
        feedback: { type: 'string' },
        comments: { type: 'string' }
      }
    }
  };

  const bulkCreateGradesSchema = {
    body: {
      type: 'object',
      required: ['grades'],
      properties: {
        grades: {
          type: 'array',
          items: {
            type: 'object',
            required: ['score', 'activityId', 'studentId'],
            properties: {
              score: { type: 'number', minimum: 0, maximum: 20 },
              activityId: { type: 'string' },
              studentId: { type: 'string' },
              feedback: { type: 'string' },
              comments: { type: 'string' }
            }
          }
        }
      }
    }
  };

  const getGradesQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        studentId: { type: 'string' },
        activityId: { type: 'string' },
        subjectId: { type: 'string' },
        classroomId: { type: 'string' },
        periodId: { type: 'string' },
        teacherId: { type: 'string' },
        minScore: { type: 'number', minimum: 0, maximum: 20 },
        maxScore: { type: 'number', minimum: 0, maximum: 20 },
        dateFrom: { type: 'string', format: 'date-time' },
        dateTo: { type: 'string', format: 'date-time' },
      }
    }
  };

  // Rutas generales para profesores
  fastify.get('/', {
    schema: { querystring: getGradesQuerySchema.querystring },
    preHandler: [authenticate, requireTeacher]
  }, getGrades as any);

  fastify.get('/stats', {
    preHandler: [authenticate, requireTeacher]
  }, async (request, reply) => {
    // Delegate to getGrades; client can compute stats or extend later
    return getGrades(request as any, reply);
  });

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
  }, getGrade as any);

  // Rutas por estudiante
  fastify.get('/student/:studentId', {
    schema: {
      params: {
        type: 'object',
        required: ['studentId'],
        properties: {
          studentId: { type: 'string' }
        }
      },
      querystring: getGradesQuerySchema.querystring,
    },
    preHandler: [authenticate, validateCUID('studentId'), requireSelfOrAdmin('studentId')]
  }, getStudentGrades as any);

  // Rutas por actividad
  fastify.get('/activity/:activityId', {
    schema: {
      params: {
        type: 'object',
        required: ['activityId'],
        properties: {
          activityId: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireTeacher, validateCUID('activityId')]
  }, async (request, reply) => {
    const { activityId } = (request as any).params as { activityId: string };
    const q = (request as any).query || {};
    (request as any).query = { ...q, activityId, page: 1, limit: 50 };
    return getGrades(request as any, reply);
  });

  // Rutas por materia
  fastify.get('/subject/:subjectId', {
    schema: {
      params: {
        type: 'object',
        required: ['subjectId'],
        properties: {
          subjectId: { type: 'string' }
        }
      },
      querystring: getGradesQuerySchema.querystring,
    },
    preHandler: [authenticate, requireTeacher, validateCUID('subjectId')]
  }, async (request, reply) => {
    const { subjectId } = (request as any).params as { subjectId: string };
    const q = (request as any).query || {};
    (request as any).query = { ...q, subjectId, page: 1, limit: 50 };
    return getGrades(request as any, reply);
  });

  // Rutas para estudiantes (sus propias calificaciones)
  fastify.get('/student/my-grades', {
    schema: { querystring: getGradesQuerySchema.querystring },
    preHandler: [authenticate, requireStudent]
  }, async (request, reply) => {
    // Usar el ID del usuario autenticado
    (request as any).params = { studentId: request.user!.userId };
    return (getStudentGrades as any)(request as any, reply);
  });

  // Rutas para profesores
  fastify.post('/', {
    schema: createGradeSchema,
    preHandler: [authenticate, requireTeacher, validateBody(validators.createGradeSchema)]
  }, createGrade as any);

  fastify.post('/bulk', {
    schema: bulkCreateGradesSchema,
    preHandler: [authenticate, requireTeacher]
  }, bulkCreateGrades as any);

  fastify.put('/:id', {
    schema: updateGradeSchema,
    preHandler: [authenticate, requireTeacher, validateCUID('id'), validateBody(validators.updateGradeSchema)]
  }, updateGrade as any);

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
  }, deleteGrade as any);

  // Rutas de exportación
  fastify.get('/export/:format', {
    schema: {
      params: {
        type: 'object',
        required: ['format'],
        properties: {
          format: { type: 'string', enum: ['excel', 'pdf', 'csv'] }
        }
      },
      querystring: getGradesQuerySchema.querystring,
    },
    preHandler: [authenticate, requireTeacher]
  }, async (request, reply) => {
    // Fallback: return grades JSON for now; exporting can be implemented later
    return getGrades(request as any, reply);
  });
};

export default gradesRoutes;
export { gradesRoutes };
