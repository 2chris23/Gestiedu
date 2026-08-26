import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { getTenantPrisma } from '../../config/database';

import { activitiesService } from '../../services/activities.service';

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
 * Registra los manejadores de eventos para actividades
 */
export function registerActivitiesHandlers(io: Server, socket: AuthenticatedSocket) {
  socket.on('activities:create', async (data) => {
    try {
      const instituteId = socket.user?.instituteId;
      if (!instituteId) {
        socket.emit('error', { message: 'No se pudo determinar el instituto' });
        return;
      }
      const prisma = await getTenantPrisma(instituteId);
      const activity = await activitiesService.createActivity(prisma, {
        ...data,
        createdBy: socket.user!.userId,
        instituteId
      });
      io.emit('activities:created', activity);
      logger.info('Actividad creada', { userId: socket.user?.id });
      socket.emit('activities:created', { success: true, data: activity });
    } catch (error) {
      logger.error('Error al crear actividad', { error });
      socket.emit('error', { message: 'Error al crear actividad' });
    }
  });

  socket.on('activities:update', async (data) => {
    try {
      const instituteId = socket.user?.instituteId;
      if (!instituteId) {
        socket.emit('error', { message: 'No se pudo determinar el instituto' });
        return;
      }
      const prisma = await getTenantPrisma(instituteId);
      const { id, ...updateData } = data;
      const activity = await activitiesService.updateActivity(prisma, id, updateData);
      io.emit('activities:updated', activity);
      logger.info('Actividad actualizada', { userId: socket.user?.id });
      socket.emit('activities:updated', { success: true, data: activity });
    } catch (error) {
      logger.error('Error al actualizar actividad', { error });
      socket.emit('error', { message: 'Error al actualizar actividad' });
    }
  });

  socket.on('activities:delete', async (data) => {
    try {
      const instituteId = socket.user?.instituteId;
      if (!instituteId) {
        socket.emit('error', { message: 'No se pudo determinar el instituto' });
        return;
      }
      const prisma = await getTenantPrisma(instituteId);
      await activitiesService.deleteActivity(prisma, data.id);
      io.emit('activities:deleted', data);
      logger.info('Actividad eliminada', { userId: socket.user?.id, activityId: data.id });
      socket.emit('activities:deleted', { success: true, data });
    } catch (error) {
      logger.error('Error al eliminar actividad', { error });
      socket.emit('error', { message: 'Error al eliminar actividad' });
    }
  });
}
