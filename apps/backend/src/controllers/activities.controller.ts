import { ActivityType, ActivityScope, UserRole } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { RedisCache } from '../config/redis';
import { CACHE_TTL } from '../utils/constants';
import { AppErrors } from '../middleware/error.middleware';
import { RequestUser } from '../types/fastify';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';
import { assertClassroomScope, canSeeClassroom, teacherClassroomIds } from '../services/authorization.service';

/**
 * LAS SECCIONES CUYAS ACTIVIDADES PUEDE VER QUIEN PIDE (null = todas)
 *
 * El representante no tenía filtro ninguno: veía las actividades de todo el
 * liceo y, al abrir una, las notas de todos los alumnos que la hicieron. Y al
 * profesor se le medía con `teacherClassroom`, una tabla vieja que no dice qué
 * materias imparte (`quien-puede-que.test.ts`).
 */
async function seccionesQuePuedeVer(db: any, user: RequestUser): Promise<string[] | null> {
  const id = user?.userId;
  if (user?.role === UserRole.ADMIN) return null;
  if (user?.role === UserRole.TEACHER) {
    const [nuevas, viejas] = await Promise.all([
      teacherClassroomIds(db, id),
      db.teacherClassroom.findMany({ where: { teacherId: id }, select: { classroomId: true } }),
    ]);
    return Array.from(new Set([...nuevas, ...viejas.map((t: any) => t.classroomId)]));
  }
  if (user?.role === UserRole.STUDENT) {
    const suyas = await db.studentClassroom.findMany({ where: { studentId: id, isActive: true }, select: { classroomId: true } });
    return suyas.map((x: any) => x.classroomId);
  }
  if (user?.role === UserRole.TUTOR) {
    const deSusHijos = await db.studentClassroom.findMany({
      where: { isActive: true, student: { studentTutorings: { some: { tutorId: id } } } },
      select: { classroomId: true },
    });
    return Array.from(new Set(deSusHijos.map((x: any) => x.classroomId as string)));
  }
  return [];
}

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
      await assertClassroomScope(db, user as any, activityData.classroomId, {
        subjectId: activityData.subjectId,
        accion: 'dejar actividades',
      });
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

    return reply.status(201).send({
      success: true,
      message: 'Actividad creada exitosamente',
      data: activity,
      activity
    });
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
      // El profesor debe llevar esa sección o ser el creador
      if (activity.createdBy !== userId && activity.classroomId) {
        const suyas = (await seccionesQuePuedeVer(db, user)) ?? [];
        if (!suyas.includes(activity.classroomId)) {
          throw AppErrors.Forbidden('No tienes acceso a esta actividad');
        }
      }
    } else if (userRole === UserRole.TUTOR) {
      // El representante: solo si uno de los suyos estudia en esa sección, y
      // de las notas, solo las de los suyos.
      if (activity.classroomId && !(await canSeeClassroom(db, user as any, activity.classroomId))) {
        throw AppErrors.Forbidden('No tienes acceso a esta actividad');
      }
      const suyos = await db.studentTutor.findMany({ where: { tutorId: userId }, select: { studentId: true } });
      const ids = new Set(suyos.map((x: any) => x.studentId));
      (activity as any).grades = ((activity as any).grades || []).filter((g: any) => ids.has(g.studentId));
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
    //
    // Va dentro de `AND` y no suelto en `where.OR`, y esto NO es un capricho de
    // estilo: unas líneas más abajo el filtro por rol también escribe
    // `where.OR`, y al escribirlo BORRABA el de la búsqueda. Efecto en el liceo:
    // el profesor (y el estudiante) escribía una palabra en el buscador y la
    // lista salía exactamente igual, sin filtrar nada. Al administrador sí le
    // funcionaba, porque su rol no escribe `where.OR`. Lo vigilan ACT-01 y
    // ACT-02.
    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } }
          ]
        }
      ];
    }

    // Filtros según el rol
    const visibles = await seccionesQuePuedeVer(db, user);
    if (visibles !== null && classroomId && !visibles.includes(classroomId)) {
      throw AppErrors.Forbidden('Esa sección no es tuya');
    }
    if (userRole === UserRole.TEACHER) {
      where.OR = [
        { createdBy: userId },
        { classroomId: { in: visibles ?? [] } },
        { scope: ActivityScope.GLOBAL }
      ];
    } else if (visibles !== null) {
      // Alumno y representante: lo visible de sus secciones y lo general.
      where.isVisible = true;
      where.OR = [
        { scope: ActivityScope.GLOBAL },
        { classroomId: { in: visibles } }
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
        await assertClassroomScope(db, user as any, existingActivity.classroomId, {
          subjectId: existingActivity.subjectId ?? undefined,
          accion: 'cambiar actividades',
        });
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

    // Cascada: Limpiar notas asociadas a esta actividad para no dejar datos
    // huérfanos. Las notas se copian a la papelera primero: borrar una actividad
    // por error no puede costar las notas de toda la sección.
    const quien = quienBorra(request as any);
    await borrarGuardandoCopia(db, 'grade', { activityId: id }, quien);
    await borrarGuardandoCopia(db, 'activity', { id }, quien);

    logger.info('Actividad y notas asociadas eliminadas en cascada', { activityId: id, userId });

    return reply.status(200).send({ success: true, message: 'Actividad eliminada exitosamente' });
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
