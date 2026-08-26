import { UserRole } from '../utils/prisma-enums';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ERROR_MESSAGES } from '../utils/constants';

/**
 * Middleware para verificar roles específicos
 */
export function requireRole(role: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Autenticación requerida'
      });
    }

    if (request.user.role !== role) {
      return reply.status(403).send({
        error: ERROR_MESSAGES.FORBIDDEN,
        message: `Acceso denegado. Se requiere rol: ${role}`
      });
    }
  };
}

/**
 * Middleware para permitir m
tiples roles
 */
export function requireRoles(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Autenticación requerida'
      });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({
        error: ERROR_MESSAGES.FORBIDDEN,
        message: `Acceso denegado. Roles permitidos: ${roles.join(', ')}`
      });
    }
  };
}

/**
 * Middleware para permisos basados en acciones especicadas
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: ERROR_MESSAGES.UNAUTHORIZED,
        message: 'Autenticación requerida'
      });
    }

    // Esto serí una llamada a un sistema de gestión de permisos
    // Por ahora solo verificamos contra un listado estrictico
    const userPermissions = getUserPermissions(request.user.role);
    if (!userPermissions.includes(permission)) {
      return reply.status(403).send({
        error: ERROR_MESSAGES.FORBIDDEN,
        message: `Permiso requerido: ${permission}`
      });
    }
  };
}

/**
 * Lista de permisos por rol
 */
function getUserPermissions(role: UserRole): string[] {
  switch(role) {
    case UserRole.ADMIN:
      return ['all']; // Admin puede hacer todo
    case UserRole.TEACHER:
      return ['view_classes', 'grade_students'];
    case UserRole.STUDENT:
      return ['view_grades'];
    case UserRole.TUTOR:
      return ['view_children_grades'];
    default:
      return [];
  }
}

export default {
  requireRole,
  requireRoles,
  requirePermission,
  getUserPermissions
};
