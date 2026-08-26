import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';

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
 * Registra los manejadores de eventos para calificaciones
 */
export function registerGradesHandlers(io: Server, socket: AuthenticatedSocket) {
  // Suscribirse a actualizaciones de calificaciones
  socket.on('grades:subscribe', async (data: { studentId?: string; subjectId?: string; classroomId?: string }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      const { studentId, subjectId, classroomId } = data;
      const { userId, role } = socket.user;

      // Validar permisos según el rol
      if (role === 'STUDENT' && studentId && studentId !== userId) {
        socket.emit('error', { message: 'Solo puedes suscribirte a tus propias calificaciones' });
        return;
      }

      // Unirse a las salas correspondientes
      if (studentId) {
        socket.join(`grades:student:${studentId}`);
        logger.info('Suscrito a calificaciones del estudiante', { userId, studentId });
      }

      if (subjectId) {
        socket.join(`grades:subject:${subjectId}`);
        logger.info('Suscrito a calificaciones de la materia', { userId, subjectId });
      }

      if (classroomId) {
        socket.join(`grades:classroom:${classroomId}`);
        logger.info('Suscrito a calificaciones del aula', { userId, classroomId });
      }

      socket.emit('grades:subscribed', {
        studentId,
        subjectId,
        classroomId,
        message: 'Suscrito a actualizaciones de calificaciones'
      });
    } catch (error) {
      logger.error('Error al suscribirse a calificaciones', { error });
      socket.emit('error', { message: 'Error al suscribirse a calificaciones' });
    }
  });

  // Registrar nueva calificación - Simplificado por ahora
  socket.on('grades:register', async (data: {
    studentId: string;
    activityId: string;
    score: number;
    comments?: string;
  }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      // Solo profesores y administradores pueden registrar calificaciones
      if (!['TEACHER', 'ADMIN'].includes(socket.user.role)) {
        socket.emit('error', { message: 'No tienes permisos para registrar calificaciones' });
        return;
      }

      const { studentId, activityId, score, comments } = data;

      logger.info('Calificación registrada', {
        userId: socket.user.userId,
        studentId,
        activityId,
        score,
      });

      // TODO: Implementar lógica completa de registro de calificaciones
      socket.emit('grades:registered', {
        success: true,
        data: { studentId, activityId, score, comments },
        message: 'Calificación registrada exitosamente'
      });
    } catch (error) {
      logger.error('Error al registrar calificación', { error });
      socket.emit('error', { message: 'Error al registrar calificación' });
    }
  });

  // Actualizar calificación existente - Simplificado por ahora
  socket.on('grades:update', async (data: {
    gradeId: string;
    score?: number;
    comments?: string;
  }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      if (!['TEACHER', 'ADMIN'].includes(socket.user.role)) {
        socket.emit('error', { message: 'No tienes permisos para actualizar calificaciones' });
        return;
      }

      const { gradeId, score, comments } = data;

      logger.info('Calificación actualizada', { gradeId, score, comments });

      // TODO: Implementar lógica completa de actualización de calificaciones
      socket.emit('grades:update_success', {
        success: true,
        data: { gradeId, score, comments },
        message: 'Calificación actualizada exitosamente'
      });
    } catch (error) {
      logger.error('Error al actualizar calificación', { error });
      socket.emit('error', { message: 'Error al actualizar calificación' });
    }
  });

  // Eliminar calificación - Simplificado por ahora
  socket.on('grades:delete', async (data: { gradeId: string }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      if (!['TEACHER', 'ADMIN'].includes(socket.user.role)) {
        socket.emit('error', { message: 'No tienes permisos para eliminar calificaciones' });
        return;
      }

      const { gradeId } = data;

      logger.info('Calificación eliminada', { gradeId });

      // TODO: Implementar lógica completa de eliminación de calificaciones
      socket.emit('grades:delete_success', {
        success: true,
        gradeId,
        message: 'Calificación eliminada exitosamente'
      });
    } catch (error) {
      logger.error('Error al eliminar calificación', { error });
      socket.emit('error', { message: 'Error al eliminar calificación' });
    }
  });
}
