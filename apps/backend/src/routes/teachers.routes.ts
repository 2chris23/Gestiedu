import { FastifyPluginAsync } from 'fastify';
import {
  getTeachers as getAllTeachers,
  getTeacher as getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getTeacherSubjects,
} from '../controllers/teachers.controller';
import { authenticate, requireAdmin, requireTeacher, requireSelfOrAdmin } from '../middleware/auth.middleware';
import { validateBody, validateCUID } from '../middleware/validation.middleware';
import validators from '../utils/validators';

const teachersRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createTeacherSchema = {
    body: {
      type: 'object',
      required: ['email', 'firstName', 'lastName'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 },
        firstName: { type: 'string', minLength: 2, maxLength: 50 },
        lastName: { type: 'string', minLength: 2, maxLength: 50 },
        phone: { type: 'string' },
        birthDate: { type: 'string', format: 'date' },
        gender: { type: 'string', enum: ['MASCULINO', 'FEMENINO', 'OTRO'] },
        address: { type: 'string' },
        isActive: { type: 'boolean', default: true }
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
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              isActive: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  };

  const updateTeacherSchema = {
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
        firstName: { type: 'string', minLength: 2, maxLength: 50 },
        lastName: { type: 'string', minLength: 2, maxLength: 50 },
        phone: { type: 'string' },
        birthDate: { type: 'string', format: 'date' },
        gender: { type: 'string', enum: ['MASCULINO', 'FEMENINO', 'OTRO'] },
        address: { type: 'string' },
        isActive: { type: 'boolean' }
      }
    }
  };

  const getTeachersQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        search: { type: 'string' },
        isActive: { type: 'boolean' }
      }
    }
  };

  const updateProfileSchema = {
    body: {
      type: 'object',
      properties: {
        firstName: { type: 'string', minLength: 2, maxLength: 50 },
        lastName: { type: 'string', minLength: 2, maxLength: 50 },
        phone: { type: 'string' },
        address: { type: 'string' }
      }
    }
  };

  // Rutas generales para administradores
  fastify.get('/', {
    schema: { querystring: getTeachersQuerySchema.querystring },
    preHandler: [authenticate, requireAdmin]
  }, getAllTeachers as any);

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
    preHandler: [authenticate, requireSelfOrAdmin('id')]
  }, getTeacherById as any);

  fastify.post('/', {
    schema: createTeacherSchema,
    preHandler: [authenticate, requireAdmin, validateBody(validators.createUserSchema)]
  }, createTeacher as any);

  fastify.put('/:id', {
    schema: updateTeacherSchema,
    preHandler: [authenticate, requireAdmin, validateCUID('id'), validateBody(validators.updateUserSchema)]
  }, updateTeacher as any);

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
  }, deleteTeacher as any);

  // Rutas de perfil personal de profesores
  fastify.get('/profile/me', {
    preHandler: [authenticate, requireTeacher]
  }, async (request, reply) => {
    const id = request.user!.userId;
    (request as any).params = { id };
    return (getTeacherById as any)(request as any, reply);
  });

  fastify.put('/profile/me', {
    schema: updateProfileSchema,
    preHandler: [authenticate, requireTeacher, validateBody(validators.updateUserSchema)]
  }, async (request, reply) => {
    const id = request.user!.userId;
    (request as any).params = { id };
    return (updateTeacher as any)(request as any, reply);
  });

  // Rutas académicas para profesores
  fastify.get('/my-subjects', {
    preHandler: [authenticate, requireTeacher]
  }, async (request, reply) => {
    const id = request.user!.userId;
    (request as any).params = { id };
    return (getTeacherSubjects as any)(request as any, reply);
  });

  fastify.get('/my-classrooms', {
    preHandler: [authenticate, requireTeacher]
  }, async (request, reply) => {
    const id = request.user!.userId;
    // SEGURIDAD: sin fallback al platform DB — tenantPrisma viene de identifyTenant
    const db = (request as any).tenantPrisma;
    if (!db) {
      return reply.status(401).send({ error: 'No se pudo determinar el instituto', code: 'TENANT_NOT_RESOLVED' });
    }
    const teacher = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        classroomsAsTeacher: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
            _count: { select: { students: true } }
          }
        }
      }
    });
    if (!teacher) {
      return reply.status(404).send({ error: 'Profesor no encontrado', code: 'TEACHER_NOT_FOUND' });
    }
    return reply.status(200).send({ classrooms: teacher.classroomsAsTeacher });
  });

  // Dashboard de profesores
  fastify.get('/my-dashboard', {
    preHandler: [authenticate, requireTeacher]
  }, async (request, reply) => {
    const id = request.user!.userId;
    // SEGURIDAD: sin fallback al platform DB — tenantPrisma viene de identifyTenant
    const db = (request as any).tenantPrisma;
    if (!db) {
      return reply.status(401).send({ error: 'No se pudo determinar el instituto', code: 'TENANT_NOT_RESOLVED' });
    }
    const [teacher, recentGrades] = await Promise.all([
      db.user.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          classroomsAsTeacher: { select: { id: true } },
          subjectTeachings: { select: { id: true } },
        }
      }),
      db.grade.findMany({
        where: { teacherId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          score: true,
          createdAt: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          subject: { select: { id: true, name: true } }
        }
      })
    ]);
    if (!teacher) {
      return reply.status(404).send({ error: 'Profesor no encontrado', code: 'TEACHER_NOT_FOUND' });
    }
    return reply.status(200).send({
      teacher: { id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName },
      stats: {
        classrooms: teacher.classroomsAsTeacher.length,
        subjects: teacher.subjectTeachings.length,
        recentGrades: recentGrades.length,
      },
      recentGrades
    });
  });
};

export default teachersRoutes;
export { teachersRoutes };
