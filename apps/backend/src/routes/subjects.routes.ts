import { FastifyPluginAsync } from 'fastify';
import {
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectTeachers,
  getSubjectStudents,
  getSubjectStats
} from '../controllers/subjects.controller';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import validators from '../utils/validators';
import { dondeSeDa, ponerEnSecciones } from '../services/secciones-de-la-materia.service';
import { responderErrorClaro } from '../utils/error-claro';
import { quienBorra } from '../utils/papelera';

const subjectsRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createSubjectSchema = {
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 100 },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        evaluacion: { type: 'string', enum: ['NUMERICA', 'CUALITATIVA'] },
        porGrupos: { type: 'boolean' }
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
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        evaluacion: { type: 'string', enum: ['NUMERICA', 'CUALITATIVA'] },
        porGrupos: { type: 'boolean' }
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


  // Rutas generales
  fastify.get('/', {
    schema: { querystring: getSubjectsQuerySchema.querystring },
    preHandler: [authenticate]
  }, getAllSubjects);

  fastify.get('/stats', {
    preHandler: [authenticate, requireAdmin]
  }, getSubjectStats);


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

  // Dónde se da la materia (por año y sección): desde Materias, no desde cada
  // sección (`services/secciones-de-la-materia.service.ts`, SECC-MAT-*).
  const liceoDe = (r: any) => String(r.user?.instituteId ?? r.institute?.id ?? '');
  fastify.get('/:id/secciones', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
      querystring: { type: 'object', required: ['academicYearId'], properties: { academicYearId: { type: 'string', minLength: 1, maxLength: 64 } } },
    },
    preHandler: [authenticate, requireAdmin],
  }, async (request: any, reply) => {
    try {
      return reply.send({ success: true, data: await dondeSeDa(request.tenantPrisma, request.params.id, request.query.academicYearId) });
    } catch (e) {
      return responderErrorClaro(reply, e);
    }
  });
  fastify.put('/:id/secciones', {
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['academicYearId', 'poner', 'quitar'],
        properties: {
          academicYearId: { type: 'string', minLength: 1, maxLength: 64 },
          poner: {
            type: 'array',
            maxItems: 200,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['classroomId', 'weeklyBlocks'],
              properties: { classroomId: { type: 'string', minLength: 1, maxLength: 64 }, weeklyBlocks: { type: 'integer', minimum: 0, maximum: 40 } },
            },
          },
          quitar: { type: 'array', maxItems: 200, items: { type: 'string', minLength: 1, maxLength: 64 } },
        },
      },
    },
    preHandler: [authenticate, requireAdmin],
  }, async (request: any, reply) => {
    try {
      return reply.send({
        success: true,
        data: await ponerEnSecciones(request.tenantPrisma, liceoDe(request), request.params.id, request.body, quienBorra(request)),
      });
    } catch (e) {
      return responderErrorClaro(reply, e);
    }
  });


};

export default subjectsRoutes;
export { subjectsRoutes };
