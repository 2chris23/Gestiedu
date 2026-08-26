import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { verifyAccessToken } from '../../config/jwt';
import { getTenantPrisma } from '../../config/database';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    userId: string;
    email: string;
    role: string;
    instituteId: string | null;
  };
}

/**
 * Registra los manejadores de eventos de autenticación.
 *
 * SEGURIDAD: El JWT lleva el claim instituteId. El socket resuelve la tenant DB
 * con getTenantPrisma(instituteId) — no usa el singleton. Si el token no declara
 * instituto, la autenticación se rechaza (fail-closed).
 */
export function registerAuthHandlers(io: Server, socket: AuthenticatedSocket) {
  socket.on('auth:login', async (data: { token: string }) => {
    try {
      const { token } = data;

      if (!token) {
        socket.emit('error', { message: 'Token requerido' });
        return;
      }

      // Verificar el token
      const decoded = verifyAccessToken(token);
      if (!decoded) {
        socket.emit('error', { message: 'Token inválido' });
        return;
      }

      // SEGURIDAD: el token debe declarar su instituto para resolver la tenant DB
      const instituteId = decoded.instituteId;
      if (!instituteId) {
        socket.emit('error', { message: 'Token no declara instituto' });
        return;
      }

      const prisma = await getTenantPrisma(instituteId);

      // Buscar el usuario en la tenant DB
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          isActive: true
        }
      });

      if (!user || !user.isActive) {
        socket.emit('error', { message: 'Usuario no encontrado o inactivo' });
        return;
      }

      // Asignar información del usuario al socket (incluye instituteId)
      socket.user = {
        id: user.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        instituteId,
      };

      // Unirse a salas por rol e instituto
      socket.join(`role:${user.role}`);
      socket.join(`user:${user.id}`);
      socket.join(`institute:${instituteId}`);

      socket.emit('auth:success', {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName
        }
      });

      logger.info('Usuario autenticado en socket', { userId: user.id, role: user.role, instituteId });
    } catch (error) {
      logger.error('Error en autenticación socket', { error: error instanceof Error ? error.message : String(error) });
      socket.emit('error', { message: 'Error de autenticación' });
    }
  });

  socket.on('auth:logout', async () => {
    try {
      if (socket.user) {
        // Salir de todas las salas
        socket.leave(`role:${socket.user.role}`);
        socket.leave(`user:${socket.user.userId}`);
        if (socket.user.instituteId) {
          socket.leave(`institute:${socket.user.instituteId}`);
        }

        logger.info('Usuario desconectado del socket', { userId: socket.user.userId });

        socket.user = undefined;
      }

      socket.emit('auth:logout_success');
    } catch (error) {
      logger.error('Error en logout socket', { error: error instanceof Error ? error.message : String(error) });
      socket.emit('error', { message: 'Error al cerrar sesión' });
    }
  });

  socket.on('auth:verify', async () => {
    try {
      if (!socket.user) {
        socket.emit('auth:not_authenticated');
        return;
      }

      const instituteId = socket.user.instituteId;
      if (!instituteId) {
        socket.user = undefined;
        socket.emit('auth:not_authenticated');
        return;
      }

      const prisma = await getTenantPrisma(instituteId);

      // Verificar que el usuario sigue activo (en la tenant DB)
      const user = await prisma.user.findUnique({
        where: { id: socket.user.userId },
        select: {
          id: true,
          isActive: true
        }
      });

      if (!user || !user.isActive) {
        socket.user = undefined;
        socket.emit('auth:not_authenticated');
        return;
      }

      socket.emit('auth:verified', {
        user: socket.user
      });
    } catch (error) {
      logger.error('Error verificando autenticación socket', { error: error instanceof Error ? error.message : String(error) });
      socket.emit('error', { message: 'Error de verificación' });
    }
  });
}
