// Middleware de rooms socket

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../../types';
import { logger } from '../../utils/logger';
import { createRoomName } from '../events';

/**
 * Gestiona la unión automática a salas basada en el rol del usuario
 */
export function autoJoinRooms(io: Server, socket: AuthenticatedSocket) {
  if (!socket.user) {
    logger.warn('Attempted to join rooms without user authentication', { socketId: socket.id });
    return;
  }

  const { userId, role } = socket.user;

  try {
    // Unirse a la sala personal del usuario
    const userRoom = createRoomName.user(userId);
    socket.join(userRoom);
    logger.info('User joined personal room', { userId, room: userRoom });

    // Unirse a salas basadas en el rol
    switch (role) {
      case 'ADMIN':
        // Los administradores se unen a todas las salas de notificaciones
        socket.join('admin:notifications');
        socket.join('system:events');
        logger.info('Admin joined administrative rooms', { userId, role });
        break;

      case 'TEACHER':
        // Los profesores se unen a salas de sus materias y aulas
        socket.join('teachers:notifications');
        // Aquí podrías añadir lógica para unirse a salas específicas de materias
        logger.info('Teacher joined teacher rooms', { userId, role });
        break;

      case 'STUDENT':
        // Los estudiantes se unen a salas de sus aulas y materias
        socket.join('students:notifications');
        // Aquí podrías añadir lógica para unirse a salas específicas de aulas
        logger.info('Student joined student rooms', { userId, role });
        break;

      case 'TUTOR':
        // Los tutores se unen a salas relacionadas con sus hijos
        socket.join('tutors:notifications');
        logger.info('Tutor joined tutor rooms', { userId, role });
        break;

      default:
        logger.warn('Unknown user role for room assignment', { userId, role });
    }

    // Emitir evento de confirmación
    socket.emit('rooms:joined', {
      message: 'Conectado a las salas correspondientes',
      rooms: Array.from(socket.rooms),
    });
  } catch (error) {
    logger.error('Error joining rooms', { error, userId, role });
    socket.emit('error', { message: 'Error al conectarse a las salas' });
  }
}

/**
 * Maneja la salida de todas las salas al desconectarse
 */
export function leaveAllRooms(socket: AuthenticatedSocket) {
  if (!socket.user) return;

  const { userId } = socket.user;
  const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);

  rooms.forEach(room => {
    socket.leave(room);
  });

  logger.info('User left all rooms on disconnect', { userId, rooms });
}

/**
 * Middleware para validar permisos antes de unirse a una sala
 */
export function validateRoomAccess() {
  return async (socket: AuthenticatedSocket, roomName: string, next: (err?: Error) => void) => {
    if (!socket.user) {
      return next(new Error('Usuario no autenticado'));
    }

    const { userId, role } = socket.user;

    try {
      // Extraer tipo y ID de la sala
      const [roomType, roomId, subType] = roomName.split(':');

      switch (roomType) {
        case 'classroom':
          // Validar acceso a aula
          if (role === 'ADMIN') {
            // Los administradores tienen acceso a todas las aulas
            break;
          }
          // Aquí podrías validar si el usuario tiene acceso a esta aula específica
          break;

        case 'student':
          // Validar acceso a datos de estudiante
          if (role === 'ADMIN' || role === 'TEACHER') {
            // Administradores y profesores pueden acceder
            break;
          }
          if (role === 'STUDENT' && roomId === userId) {
            // Los estudiantes solo pueden acceder a su propia sala
            break;
          }
          if (role === 'TUTOR') {
            // Validar que el tutor es padre del estudiante
            // Aquí podrías añadir validación de base de datos
            break;
          }
          return next(new Error('No tienes permisos para acceder a esta sala'));

        case 'teacher':
          // Validar acceso a datos de profesor
          if (role === 'ADMIN') break;
          if (role === 'TEACHER' && roomId === userId) break;
          return next(new Error('No tienes permisos para acceder a esta sala'));

        case 'user':
          // Solo el propio usuario puede acceder a su sala personal
          if (roomId !== userId && role !== 'ADMIN') {
            return next(new Error('No puedes acceder a la sala de otro usuario'));
          }
          break;

        default:
          logger.warn('Unknown room type requested', { userId, role, roomName });
          return next(new Error('Tipo de sala desconocido'));
      }

      logger.info('Room access validated successfully', { userId, role, roomName });
      next();
    } catch (error) {
      logger.error('Error validating room access', { error, userId, role, roomName });
      next(new Error('Error validando acceso a la sala'));
    }
  };
}
