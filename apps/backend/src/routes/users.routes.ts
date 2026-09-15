import { FastifyPluginAsync } from 'fastify';
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  archiveUser,
  unarchiveUser,
  getUsersByRole,
  getUserProfile,
  updateUserProfile,
  toggleUserStatus,
  getUserStats
} from '../controllers/users.controller';
import { authenticate, requireAdmin, requireTeacher, requireSelfOrAdmin } from '../middleware/auth.middleware';
import { validateBody, validateParams, validateQuery, validateCUID } from '../middleware/validation.middleware';
import { createUserSchema as zCreateUserSchema, updateUserSchema as zUpdateUserSchema } from '../utils/validators';
import { checkPlanLimits } from '../middleware/plan-limits.middleware';

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // Esquemas para validación
  const createUserSchema = {
    body: {
      type: 'object',
      required: ['email', 'firstName', 'lastName', 'role'],
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
        firstName: { type: 'string', minLength: 2, maxLength: 50 },
        lastName: { type: 'string', minLength: 2, maxLength: 50 },
        role: { type: 'string', enum: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'] },
        phone: { type: 'string' },
        birthDate: { type: 'string' },
        gender: { type: 'string', enum: ['MASCULINO', 'FEMENINO', 'OTRO'] },
        address: { type: 'string' },
        isActive: { type: 'boolean', default: true }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string' },
              isActive: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  };

  const updateUserSchema = {
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
        address: { type: 'string' }
      }
    }
  };

  const getUsersQuerySchema = {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        role: { type: 'string', enum: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'] },
        search: { type: 'string' },
        isActive: { type: 'boolean' },
        status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED', 'ALL'] }
      }
    }
  };

  // El directorio del liceo es del administrador: antes cualquier estudiante
  // autenticado podía listar a todo el mundo con sus correos.
  fastify.get('/', {
    schema: getUsersQuerySchema,
    preHandler: [authenticate, requireAdmin]
  }, getUsers as any);

  fastify.get('/stats', {
    preHandler: [authenticate, requireAdmin]
  }, getUserStats as any);

  // Igual que el listado: la lista por rol es del administrador
  fastify.get('/role/:role', {
    schema: {
      params: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['ADMIN', 'TEACHER', 'STUDENT', 'TUTOR'] }
        }
      }
    },
    preHandler: [authenticate, requireAdmin]
  }, getUsersByRole as any);

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
  }, getUser as any);

  // Rutas para administradores
  fastify.post('/', {
    schema: createUserSchema,
    preHandler: [authenticate, requireAdmin, validateBody(zCreateUserSchema), checkPlanLimits]
  }, createUser as any);

  fastify.put('/:id', {
    schema: updateUserSchema,
    preHandler: [authenticate, requireAdmin, validateBody(zUpdateUserSchema)]
  }, updateUser as any);

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
  }, deleteUser as any);

  fastify.post('/:id/archive', {
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
  }, archiveUser as any);

  fastify.post('/:id/unarchive', {
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
  }, unarchiveUser as any);

  fastify.patch('/:id/status', {
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
        required: ['isActive'],
        properties: {
          isActive: { type: 'boolean' }
        }
      }
    },
    preHandler: [authenticate, requireAdmin]
  }, toggleUserStatus as any);

  // Rutas de perfil personal
  fastify.get('/profile/me', {
    preHandler: [authenticate]
  }, getUserProfile as any);

  fastify.put('/profile/me', {
    schema: {
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string', minLength: 2, maxLength: 50 },
          lastName: { type: 'string', minLength: 2, maxLength: 50 },
          phone: { type: 'string' },
          address: { type: 'string' }
        }
      }
    },
  // Los datos personales (nombre, correo, teléfono, dirección) los corrige SOLO
  // el administrador: si cada quien edita su ficha, cualquiera puede poner un
  // dato falso o un chiste en los registros del liceo.
    preHandler: [authenticate, requireAdmin]
  }, updateUserProfile as any);
};

export default usersRoutes;
export { usersRoutes };
