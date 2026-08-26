import { ActivityType, ActivityScope, UserRole } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { RedisCache } from '../config/redis';
import { CACHE_TTL } from '../utils/constants';
import { AppErrors } from '../middleware/error.middleware';
import { RequestUser } from '../types/fastify';

// Helper para obtener el cliente DB del tenant.
// SEGURIDAD: No hay fallback al platform DB. Si tenantPrisma no está resuelto,
// la request debe fallar (fail-closed) para evitar filtrar datos entre institutos.
function getDb(request: FastifyRequest) {
  const db = (request as any).tenantPrisma;
  if (!db) {
    throw AppErrors.Forbidden('No se pudo determinar el instituto. Request abortada por seguridad.');
  }
  return db;
}

// Tipos para las requests
interface CreateActivityRequest {
  Body: {
    title: string;
    description?: string;
    type: ActivityType;
    scope: ActivityScope;
    startDate: string;
    endDate?: string;
    dueDate?: string;
    maxGrade?: number;
    weight?: number;
    isVisible?: boolean;
    periodId?: string;
    subjectId?: string;
    classroomId?: string;
    // Campos del Plan de Evaluación Venezolano
    temaGenerador?: string;
    tejidoTematico?: string;
    referentes?: string;
    tecnicas?: string;
    instrumentos?: string;
    criterios?: string;
    lapso?: string;
  };
}

interface UpdateActivityRequest {
  Params: { id: string };
  Body: Partial<CreateActivityRequest['Body']>;
}

interface GetActivityRequest {
  Params: { id: string };
}

interface GetActivitiesRequest {
  Querystring: {
    page?: number;
    limit?: number;
    type?: ActivityType;
    scope?: ActivityScope;
    subjectId?: string;
    classroomId?: string;
    periodId?: string;
    lapso?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  };
}

/**
 * Crear nueva actividad
 */
export async function createActivity(
  request: FastifyRequest<CreateActivityRequest>,
  reply: FastifyReply
) {
  try {
    const activityData = request.body;
    const user = request.user as RequestUser;
    const instituteId = user?.instituteId;
    const teacherId = user?.userId;
    const db = getDb(request);

    if (!teacherId) {
      throw AppErrors.Forbidden('Usuario no autenticado correctamente');
    }

    // Verificar permisos para crear actividades
    if (user?.role !== UserRole.ADMIN && user?.role !== UserRole.TEACHER) {
      throw AppErrors.Forbidden('No tienes permisos para crear actividades');
    }

    // Validaciones específicas según el scope
    if (activityData.scope === ActivityScope.CLASSROOM && !activityData.classroomId) {
      return reply.status(400).send({
        error: 'El ID del aula es requerido para actividades de aula',
        code: 'CLASSROOM_ID_REQUIRED'
      });
    }

    // Si es profesor, verificar que tenga acceso al aula
    if (user?.role === UserRole.TEACHER && activityData.classroomId) {
      const teacherClassroom = await db.teacherClassroom.findFirst({
        where: {
          teacherId,
          classroomId: activityData.classroomId
        }
      });

      if (!teacherClassroom) {
        throw AppErrors.Forbidden('No tienes acceso a esta aula');
      }
    }

    // Crear la actividad
    const activity = await db.activity.create({
      data: {
        title: activityData.title,
        description: activityData.description,
        type: activityData.type,
        scope: activityData.scope,
        startDate: new Date(activityData.startDate),
        endDate: activityData.endDate ? new Date(activityData.endDate) : null,
        dueDate: activityData.dueDate ? new Date(activityData.dueDate) : null,
        maxGrade: activityData.maxGrade ?? 20,
        weight: activityData.weight ?? 1,
        isVisible: activityData.isVisible ?? true,
        periodId: activityData.periodId,
        subjectId: activityData.subjectId,
        classroomId: activityData.classroomId,
        temaGenerador: activityData.temaGenerador,
        tejidoTematico: activityData.tejidoTematico,
        referentes: activityData.referentes,
        tecnicas: activityData.tecnicas,
        instrumentos: activityData.instrumentos,
        criterios: activityData.criterios,
        lapso: activityData.lapso,
        createdBy: teacherId
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
            grade: true
          }
        },
        period: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    logger.info('Actividad creada', { activityId: activity.id, teacherId });

    return reply.status(201).send({ activity });
  } catch (error) {
    logger.error('Error al crear actividad', { error: error instanceof Error ? error.message : String(error) });
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}

/**
 * Obtener actividad por ID
 */
export async function getActivity(
  request: FastifyRequest<GetActivityRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const user = request.user as RequestUser;
    const instituteId = user?.instituteId;
    const userId = user?.userId;
    const userRole = user?.role;
    const db = getDb(request);

    if (!userId) {
      throw AppErrors.Forbidden('Usuario no autenticado');
    }

    const activity = await db.activity.findFirst({
      where: {
        id,
      },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
            grade: true
          }
        },
        period: {
          select: {
            id: true,
            name: true
          }
        },
        grades: {
          where: userRole === UserRole.STUDENT ? { studentId: userId } : undefined,
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!activity) {
      return reply.status(404).send({
        error: 'Actividad no encontrada',
        code: 'ACTIVITY_NOT_FOUND'
      });
    }

    // Verificar permisos según el rol
    if (userRole === UserRole.TEACHER) {
      // El profesor debe tener acceso al aula o ser el creador
      if (activity.createdBy !== userId && activity.classroomId) {
        const teacherClassroom = await db.teacherClassroom.findFirst({
          where: {
            teacherId: userId,
            classroomId: activity.classroomId
          }
        });

        if (!teacherClassroom) {
          throw AppErrors.Forbidden('No tienes acceso a esta actividad');
        }
      }
    } else if (userRole === UserRole.STUDENT) {
      // El estudiante debe estar en el aula de la actividad
      if (activity.classroomId) {
        const studentClassroom = await db.studentClassroom.findFirst({
          where: {
            studentId: userId,
            classroomId: activity.classroomId,
            isActive: true
          }
        });

        if (!studentClassroom) {
          throw AppErrors.Forbidden('No tienes acceso a esta actividad');
        }
      }
    }

    return reply.send({ activity });
  } catch (error) {
    logger.error('Error al obtener actividad', {
      error: error instanceof Error ? error.message : String(error),
      activityId: request.params.id
    });
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}

/**
 * Obtener lista de actividades con filtros
 */
export async function getActivities(
  request: FastifyRequest<GetActivitiesRequest>,
  reply: FastifyReply
) {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      scope,
      subjectId,
      classroomId,
      periodId,
      lapso,
      startDate,
      endDate,
      search,
      sortBy = 'startDate',
      sortOrder = 'desc'
    } = request.query;

    const user = request.user as RequestUser;
    const instituteId = user?.instituteId;
    const userId = user?.userId;
    const userRole = user?.role;
    const db = getDb(request);

    if (!userId) {
      throw AppErrors.Forbidden('Usuario no autenticado');
    }

    const offset = (page - 1) * limit;

    // Construir filtros base
    const where: any = {
      isActive: true
    };

    // Filtros adicionales
    if (type) where.type = type;
    if (scope) where.scope = scope;
    if (subjectId) where.subjectId = subjectId;
    if (classroomId) where.classroomId = classroomId;
    if (periodId) where.periodId = periodId;
    if (lapso) where.lapso = lapso;

    // Filtro por fechas
    if (startDate && endDate) {
      where.startDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    } else if (startDate) {
      where.startDate = { gte: new Date(startDate) };
    } else if (endDate) {
      where.startDate = { lte: new Date(endDate) };
    }

    // Búsqueda por texto
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Filtros según el rol
    if (userRole === UserRole.TEACHER) {
      const teacherClassrooms = await db.teacherClassroom.findMany({
        where: { teacherId: userId },
        select: { classroomId: true }
      });

      const classroomIds = teacherClassrooms.map((tc: any) => tc.classroomId);

      where.OR = [
        { createdBy: userId },
        { classroomId: { in: classroomIds } },
        { scope: ActivityScope.GLOBAL }
      ];
    } else if (userRole === UserRole.STUDENT) {
      const studentClassrooms = await db.studentClassroom.findMany({
        where: {
          studentId: userId,
          isActive: true
        },
        select: { classroomId: true }
      });

      const classroomIds = studentClassrooms.map((sc: any) => sc.classroomId);

      where.isVisible = true;
      where.OR = [
        { scope: ActivityScope.GLOBAL },
        { classroomId: { in: classroomIds } }
      ];
    }

    // Contar total
    const total = await db.activity.count({ where });

    // Obtener actividades
    const activities = await db.activity.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
            grade: true
          }
        },
        period: {
          select: {
            id: true,
            name: true
          }
        },
        _count: {
          select: {
            grades: true
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder
      },
      skip: offset,
      take: limit
    });

    return reply.send({
      activities,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error al obtener actividades', { error: error instanceof Error ? error.message : String(error) });
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}

/**
 * Actualizar actividad
 */
export async function updateActivity(
  request: FastifyRequest<UpdateActivityRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const updateData = request.body;
    const user = request.user as RequestUser;
    const instituteId = user?.instituteId;
    const userId = user?.userId;
    const userRole = user?.role;
    const db = getDb(request);

    if (!userId) {
      throw AppErrors.Forbidden('Usuario no autenticado');
    }

    // Buscar la actividad
    const existingActivity = await db.activity.findFirst({
      where: {
        id,
      }
    });

    if (!existingActivity) {
      return reply.status(404).send({
        error: 'Actividad no encontrada',
        code: 'ACTIVITY_NOT_FOUND'
      });
    }

    // Verificar permisos
    if (userRole === UserRole.TEACHER && existingActivity.createdBy !== userId) {
      if (existingActivity.classroomId) {
        const teacherClassroom = await db.teacherClassroom.findFirst({
          where: {
            teacherId: userId,
            classroomId: existingActivity.classroomId
          }
        });

        if (!teacherClassroom) {
          throw AppErrors.Forbidden('No tienes permisos para editar esta actividad');
        }
      } else {
        throw AppErrors.Forbidden('No tienes permisos para editar esta actividad');
      }
    } else if (userRole !== UserRole.ADMIN && userRole !== UserRole.TEACHER) {
      throw AppErrors.Forbidden('No tienes permisos para editar actividades');
    }

    // Preparar datos de actualización
    const dataToUpdate: any = { ...updateData };

    if (updateData.startDate) {
      dataToUpdate.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      dataToUpdate.endDate = new Date(updateData.endDate);
    }
    if (updateData.dueDate) {
      dataToUpdate.dueDate = new Date(updateData.dueDate);
    }

    // Actualizar la actividad
    const activity = await db.activity.update({
      where: { id },
      data: dataToUpdate,
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
            grade: true
          }
        },
        period: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    logger.info('Actividad actualizada', { activityId: activity.id, userId });

    return reply.send({ activity });
  } catch (error) {
    logger.error('Error al actualizar actividad', {
      error: error instanceof Error ? error.message : String(error),
      activityId: request.params.id
    });
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}

/**
 * Eliminar actividad
 */
export async function deleteActivity(
  request: FastifyRequest<GetActivityRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const user = request.user as RequestUser;
    const instituteId = user?.instituteId;
    const userId = user?.userId;
    const userRole = user?.role;
    const db = getDb(request);

    if (!userId) {
      throw AppErrors.Forbidden('Usuario no autenticado');
    }

    // Buscar la actividad
    const existingActivity = await db.activity.findFirst({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            grades: true
          }
        }
      }
    });

    if (!existingActivity) {
      return reply.status(404).send({
        error: 'Actividad no encontrada',
        code: 'ACTIVITY_NOT_FOUND'
      });
    }

    // Verificar permisos
    if (userRole === UserRole.TEACHER && existingActivity.createdBy !== userId) {
      throw AppErrors.Forbidden('Solo puedes eliminar actividades que hayas creado');
    } else if (userRole !== UserRole.ADMIN && userRole !== UserRole.TEACHER) {
      throw AppErrors.Forbidden('No tienes permisos para eliminar actividades');
    }

    // Verificar si tiene calificaciones asociadas
    if (existingActivity._count.grades > 0) {
      return reply.status(400).send({
        error: 'No se puede eliminar una actividad que tiene calificaciones',
        code: 'ACTIVITY_HAS_GRADES'
      });
    }

    // Eliminar la actividad
    await db.activity.delete({
      where: { id }
    });

    logger.info('Actividad eliminada', { activityId: id, userId });

    return reply.status(204).send();
  } catch (error) {
    logger.error('Error al eliminar actividad', {
      error: error instanceof Error ? error.message : String(error),
      activityId: request.params.id
    });
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    return reply.status(500).send({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}
