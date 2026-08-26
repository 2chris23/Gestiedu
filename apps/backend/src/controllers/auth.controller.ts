import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.service';
import { logger } from '../utils/logger';
import { RequestUser } from '../types/fastify';
import { invalidateUserSession } from '../middleware/auth.middleware';

interface LoginRequest {
  Body: {
    email: string;
    password: string;
    keepSession?: boolean;
  };
}

interface RefreshTokenRequest {
  Body: {
    refreshToken: string;
  };
}

interface ChangePasswordRequest {
  Body: {
    currentPassword: string;
    newPassword: string;
  };
}

/**
 * Controlador para iniciar sesión
 */
export async function login(
  request: FastifyRequest<LoginRequest>,
  reply: FastifyReply
) {
  try {
    const loginResponse = await authService.login(
      request.body,
      request.tenantPrisma,
      request.institute?.id,
      {
        userAgent: request.headers['user-agent']?.toString(),
        ip: request.ip,
      }
    );

    return reply.status(200).send(loginResponse);
  } catch (error) {
    logger.error('Error en el inicio de sesión', { error: error instanceof Error ? error.message : String(error) });

    if (error instanceof Error && (error.message.includes('Credenciales') || error.message.includes('Usuario'))) {
      return reply.status(400).send({
        error: error.message,
        code: 'INVALID_CREDENTIALS'
      });
    }

    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para actualizar token de acceso
 */
export async function refreshToken(
  request: FastifyRequest<RefreshTokenRequest>,
  reply: FastifyReply
) {
  try {
    const result = await authService.refreshToken(request.body, request.tenantPrisma);

    return reply.status(200).send(result);
  } catch (error) {
    logger.error('Error al actualizar el token', { error: error instanceof Error ? error.message : String(error) });
    return reply.status(401).send({
      error: error instanceof Error ? error.message : 'Token inválido',
      code: 'TOKEN_INVALID'
    });
  }
}


/**
 * Controlador para cerrar sesión
 */
export async function logout(
  request: FastifyRequest<{ Body: { refreshToken?: string } }>,
  reply: FastifyReply
) {
  try {
    const user = request.user as RequestUser;
    const userId = user?.userId;
    const { refreshToken } = request.body || {};

    if (userId) {
      await authService.logout(userId, request.tenantPrisma, refreshToken);
      // Invalidar caché de sesión para que el usuario deslogueado no revalide
      await invalidateUserSession(request.institute?.id ?? user?.instituteId, userId);
    }

    return reply.status(200).send({
      message: 'Sesión cerrada correctamente',
    });
  } catch (error) {
    logger.error('Error al cerrar sesión', { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener el perfil del usuario actual
 */
export async function getProfile(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    if (!request.user) {
      return reply.status(401).send({
        error: 'No autorizado',
        code: 'UNAUTHORIZED',
      });
    }

    const user = request.user as RequestUser;
    const userData = await request.tenantPrisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        instituteId: true,
        isActive: true,
        lastLogin: true,
        avatar: true,
        phone: true,
        preferences: true,
        institute: {
          select: {
            id: true,
            name: true,
            code: true,
            logo: true,
            primaryColor: true,
            secondaryColor: true,
          },
        },
      },
    });

    if (!userData) {
      return reply.status(404).send({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND',
      });
    }

    return reply.status(200).send({ user: userData });
  } catch (error) {
    logger.error('Error al obtener el perfil del usuario', { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para listar las sesiones/dispositivos activos del usuario autenticado.
 * Nunca expone el token en sí; solo metadata (userAgent, IP, fechas).
 */
export async function getSessions(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = request.user as RequestUser;
    if (!user) {
      return reply.status(401).send({ error: 'No autorizado', code: 'UNAUTHORIZED' });
    }

    const sessions = await authService.getUserSessions(user.userId, request.tenantPrisma, {
      userAgent: request.headers['user-agent']?.toString(),
      ip: request.ip,
    });

    return reply.status(200).send({ sessions });
  } catch (error) {
    logger.error('Error al listar sesiones', { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para revocar UNA sesión específica del usuario autenticado.
 * Si el sessionId no pertenece al usuario → 404 (no revoca nada).
 */
export async function deleteSession(
  request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply
) {
  try {
    const user = request.user as RequestUser;
    if (!user) {
      return reply.status(401).send({ error: 'No autorizado', code: 'UNAUTHORIZED' });
    }

    const revoked = await authService.revokeSession(user.userId, request.params.sessionId, request.tenantPrisma);

    if (!revoked) {
      return reply.status(404).send({
        error: 'Sesión no encontrada',
        code: 'SESSION_NOT_FOUND',
      });
    }

    return reply.status(200).send({ success: true });
  } catch (error) {
    logger.error('Error al revocar sesión', { error: error instanceof Error ? error.message : String(error) });
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
export async function changePassword(
  request: FastifyRequest<ChangePasswordRequest>,
  reply: FastifyReply
) {
  try {
    if (!request.user) {
      return reply.status(401).send({
        error: 'No autorizado',
        code: 'UNAUTHORIZED',
      });
    }

    const { currentPassword, newPassword } = request.body;
    const user = request.user as RequestUser;

    await authService.changePassword(
      user.userId,
      currentPassword,
      newPassword,
      request.tenantPrisma
    );

    // Invalidar caché de sesión: la sesión debe re-leerse desde la BD
    await invalidateUserSession(request.institute?.id ?? user.instituteId, user.userId);

    return reply.status(200).send({
      message: 'Contraseña actualizada correctamente',
    });
  } catch (error) {
    logger.error('Error al cambiar la contraseña', { error: error instanceof Error ? error.message : String(error) });

    if (error instanceof Error && (error.message.includes('Credenciales') || error.message.includes('contraseña'))) {
      return reply.status(400).send({
        error: error.message,
        code: 'INVALID_CREDENTIALS'
      });
    }

    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
