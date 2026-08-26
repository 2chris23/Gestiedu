import { FastifyPluginAsync } from 'fastify';
import {
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectsByGrade,
  getSubjectTeachers,
  assignSubjectToGrade,
  removeSubjectFromGrade,
  getSubjectStudents,
  getSubjectStats
} from '../controllers/subjects.controller';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware';
import validators from '../utils/validators';

const subjectsRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createSubjectSchema = {
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 100 },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
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
              name: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  };

  const updateSubjectSchema = {
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
        name: { type: 'string', minLength: 3, maxLength: 100 },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
      }
    }
  };

  const getSubjectsQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        grade: { type: 'string' }, // Removed enum validation to allow any grade ID/Input
        search: { type: 'string' },
        isActive: { type: 'boolean' }
      }
    }
  };

  const assignTeacherSchema = {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    },
    body: {
      type: 'object',
      required: ['teacherId'],
      properties: {
        teacherId: { type: 'string' },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' }
      }
    }
  };

  // Rutas generales
  fastify.get('/', {
    schema: { querystring: getSubjectsQuerySchema.querystring },
    preHandler: [authenticate]
  }, getAllSubjects);

  fastify.get('/stats', {
    preHandler: [authenticate, requireAdmin]
  }, getSubjectStats);

  fastify.get('/grade/:grade', {
    schema: {
      params: {
        type: 'object',
        required: ['grade'],
        properties: {
          grade: { type: 'string' } // Changed from strict enum to string to allow numeric IDs
        }
      }
    },
    preHandler: [authenticate]
  }, getSubjectsByGrade);

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
    preHandler: [authenticate]
  }, getSubjectById);

  fastify.get('/:id/teachers', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate]
  }, getSubjectTeachers);

  fastify.get('/:id/students', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireTeacher]
  }, getSubjectStudents);

  // Rutas para administradores
  fastify.post('/', {
    schema: createSubjectSchema,
    preHandler: [authenticate, requireAdmin, validateBody(validators.createSubjectSchema)]
  }, createSubject);

  fastify.put('/:id', {
    schema: updateSubjectSchema,
    preHandler: [authenticate, requireAdmin, validateBody(validators.updateSubjectSchema)]
  }, updateSubject);

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
    preHandler: [authenticate, requireAdmin]
  }, deleteSubject);

  // Nueva ruta: Asignar materia a un grado completo
  fastify.post('/grade/:grade/assign', {
    schema: {
      params: {
        type: 'object',
        required: ['grade'],
        properties: {
          grade: { type: 'string' } // Changed to string to match previous schema usage, but controller parses Int
        }
      },
      body: {
        type: 'object',
        required: ['subjectId', 'teacherId'],
        properties: {
          subjectId: { type: 'string' },
          teacherId: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin]
  }, assignSubjectToGrade);

  // Nueva ruta: Remover materia de un grado
  fastify.delete('/grade/:grade/:subjectId', {
    schema: {
      params: {
        type: 'object',
        required: ['grade', 'subjectId'],
        properties: {
          grade: { type: 'string' },
          subjectId: { type: 'string' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin]
  }, removeSubjectFromGrade);
};

export default subjectsRoutes;
export { subjectsRoutes };
