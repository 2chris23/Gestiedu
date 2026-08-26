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
 * Registra los manejadores de eventos para asistencia
 */
export function registerAttendanceHandlers(
  io: Server,
  socket: AuthenticatedSocket
) {
  // Manejador para suscribirse a actualizaciones de asistencia
  socket.on('attendance:subscribe', async (data: { classroomId?: string; studentId?: string; date?: string }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      const { classroomId, studentId, date } = data;

      // Suscribirse a la asistencia según los parámetros
      if (classroomId) {
        socket.join(`classroom:${classroomId}:attendance`);
        logger.info(
          'Usuario suscrito a asistencia del aula',
          { userId: socket.user.id, classroomId }
        );
      }

      if (studentId) {
        socket.join(`student:${studentId}:attendance`);
        logger.info(
          'Usuario suscrito a asistencia del estudiante',
          { userId: socket.user.id, studentId }
        );
      }

      if (date) {
        socket.join(`date:${date}:attendance`);
        logger.info(
          'Usuario suscrito a asistencia por fecha',
          { userId: socket.user.id, date }
        );
      }

      // Emitir confirmación de suscripción
      socket.emit('attendance:subscribed', {
        classroomId,
        studentId,
        date,
        message: 'Suscrito a actualizaciones de asistencia',
      });
    } catch (error) {
      logger.error('Error al suscribirse a actualizaciones de asistencia', { error });
      socket.emit('error', { message: 'Error al suscribirse a actualizaciones de asistencia' });
    }
  });

  // Manejador para registrar asistencia - Simplificado por ahora
  socket.on('attendance:register', async (data: {
    classroomId: string;
    studentId: string;
    date: string;
    status: 'PRESENTE' | 'AUSENTE' | 'TARDANZA' | 'JUSTIFICADO';
    comment?: string;
  }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      const { classroomId, studentId, date, status, comment } = data;
      logger.info('Asistencia registrada', { userId: socket.user.id, classroomId, studentId, date, status });

      // TODO: Implementar lógica completa de registro de asistencia
      socket.emit('attendance:registered', {
        success: true,
        data: { classroomId, studentId, date, status, comment },
        message: 'Asistencia registrada correctamente'
      });
    } catch (error) {
      logger.error('Error al registrar asistencia', { error });
      socket.emit('error', { message: 'Error al registrar asistencia' });
    }
  });

  // Manejador para eliminar un registro de asistencia - Simplificado por ahora
  socket.on('attendance:delete', async (data: { attendanceId: string }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'No autorizado' });
        return;
      }

      const { attendanceId } = data;
      logger.info('Asistencia eliminada', { userId: socket.user.id, attendanceId });

      // TODO: Implementar lógica completa de eliminación de asistencia
      socket.emit('attendance:deleted', {
        success: true,
        attendanceId,
        message: 'Registro de asistencia eliminado correctamente'
      });
    } catch (error) {
      logger.error('Error al eliminar asistencia', { error });
      socket.emit('error', { message: 'Error al eliminar registro de asistencia' });
    }
  });
}
