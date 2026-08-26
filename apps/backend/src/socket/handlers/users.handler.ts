import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { getTenantPrisma } from '../../config/database';

// Interfaz para el socket autenticado
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
 * Registra los manejadores de eventos para usuarios.
 *
 * SEGURIDAD: Las queries contra la BD usan getTenantPrisma(socket.user.instituteId),
 * nunca el singleton. Si el socket no declara instituto, la operación se rechaza.
 */
export function registerUserHandlers(io: Server, socket: AuthenticatedSocket) {
  // Suscribirse a actualizaciones de estado de usuarios
  socket.on('users:subscribe', async (data: { userIds?: string[]; classroomId?: string }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      const { userIds, classroomId } = data;
      const { userId, role } = socket.user;

      // Validar permisos
      if (role === 'STUDENT' && userIds && !userIds.includes(userId)) {
        socket.emit('error', { message: 'Solo puedes suscribirte a tu propio estado' });
        return;
      }

      // Suscribirse a usuarios específicos
      if (userIds) {
        userIds.forEach(id => {
          socket.join(`user:status:${id}`);
        });
        logger.info('Suscrito a estado de usuarios', { userId, userIds });
      }

      // Suscribirse a usuarios de un aula
      if (classroomId) {
        socket.join(`classroom:users:${classroomId}`);
        logger.info('Suscrito a usuarios del aula', { userId, classroomId });
      }

      socket.emit('users:subscribed', {
        userIds,
        classroomId,
        message: 'Suscrito a actualizaciones de usuarios'
      });
    } catch (error) {
      logger.error('Error al suscribirse a usuarios', { error });
      socket.emit('error', { message: 'Error al suscribirse a usuarios' });
    }
  });

  // Actualizar estado de usuario (en línea/fuera de línea) - Simplificado por ahora
  socket.on('users:status_change', async (data: { status: 'online' | 'offline' | 'away' }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      const { status } = data;
      const { userId, instituteId } = socket.user;

      if (!instituteId) {
        socket.emit('error', { message: 'No se pudo determinar el instituto' });
        return;
      }

      const prisma = await getTenantPrisma(instituteId);

      // Actualizar última actividad del usuario en la tenant DB
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastLogin: status === 'online' ? new Date() : undefined
        }
      });

      // Emitir cambio de estado a los suscriptores
      io.to(`user:status:${userId}`)
        .emit('users:status_updated', {
          userId,
          status,
          timestamp: new Date()
        });

      logger.info('Estado de usuario actualizado', { userId, status });
    } catch (error) {
      logger.error('Error al actualizar estado de usuario', { error });
      socket.emit('error', { message: 'Error al actualizar estado' });
    }
  });

  // Obtener usuarios en línea
  socket.on('users:get_online', async (data: { classroomId?: string }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      const { classroomId } = data;
      const connectedSockets = await io.fetchSockets();

      const onlineUsers = connectedSockets
        .filter(s => (s as any).user)
        .map(s => ({
          userId: (s as any).user.userId,
          role: (s as any).user.role,
          email: (s as any).user.email
        }));

      socket.emit('users:online_list', {
        users: onlineUsers,
        count: onlineUsers.length
      });

      logger.info('Lista de usuarios en línea solicitada', { requesterId: socket.user.userId, classroomId });
    } catch (error) {
      logger.error('Error al obtener usuarios en línea', { error });
      socket.emit('error', { message: 'Error al obtener usuarios en línea' });
    }
  });

  // Enviar mensaje privado entre usuarios
  socket.on('users:private_message', async (data: {
    recipientId: string;
    message: string;
    type?: 'text' | 'notification';
  }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      const { recipientId, message, type = 'text' } = data;
      const { userId, role, instituteId } = socket.user;

      // Validar permisos (estudiantes solo pueden enviar mensajes a profesores/admin)
      if (role === 'STUDENT') {
        if (!instituteId) {
          socket.emit('error', { message: 'No se pudo determinar el instituto' });
          return;
        }
        const prisma = await getTenantPrisma(instituteId);
        const recipient = await prisma.user.findUnique({
          where: { id: recipientId },
          select: { role: true }
        });

        if (recipient && !['TEACHER', 'ADMIN'].includes(recipient.role)) {
          socket.emit('error', { message: 'No puedes enviar mensajes a este usuario' });
          return;
        }
      }

      // Enviar mensaje al destinatario
      io.to(`user:${recipientId}`).emit('users:message_received', {
        senderId: userId,
        senderRole: role,
        message,
        type,
        timestamp: new Date()
      });

      // Confirmación al remitente
      socket.emit('users:message_sent', {
        recipientId,
        message,
        type,
        timestamp: new Date()
      });

      logger.info('Mensaje privado enviado', { senderId: userId, recipientId, type });
    } catch (error) {
      logger.error('Error al enviar mensaje privado', { error });
      socket.emit('error', { message: 'Error al enviar mensaje' });
    }
  });

  // Notificar typing/escribiendo
  socket.on('users:typing', async (data: { recipientId: string; isTyping: boolean }) => {
    try {
      if (!socket.user) {
        return;
      }

      const { recipientId, isTyping } = data;
      const { userId } = socket.user;

      io.to(`user:${recipientId}`).emit('users:typing_status', {
        userId,
        isTyping,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error al notificar typing', { error });
    }
  });

  // Manejar desconexión
  socket.on('disconnect', async () => {
    try {
      if (socket.user) {
        const { userId } = socket.user;

        // Notificar desconexión a suscriptores
        io.to(`user:status:${userId}`)
          .emit('users:status_updated', {
            userId,
            status: 'offline',
            timestamp: new Date()
          });

        logger.info('Usuario desconectado', { userId });
      }
    } catch (error) {
      logger.error('Error al manejar desconexión de usuario', { error });
    }
  });
}
