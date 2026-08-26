import { UserRole, ActionType } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateScheduleDto, UpdateScheduleDto, ScheduleFiltersDto } from '../dto/schedule.dto';
import { PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';

interface CreateScheduleRequest {
  Body: CreateScheduleDto;
}

interface UpdateScheduleRequest {
  Params: { id: string };
  Body: UpdateScheduleDto;
}

interface GetScheduleRequest {
  Params: { id: string };
}

interface GetSchedulesRequest {
  Querystring: ScheduleFiltersDto & PaginationInput;
}

interface DeleteScheduleRequest {
  Params: { id: string };
}

interface GetClassroomSchedulesRequest {
  Params: { classroomId: string };
  Querystring: {
    dayOfWeek?: string;
  };
}

/**
 * Controlador para crear un horario
 */
export async function createSchedule(
  request: FastifyRequest<CreateScheduleRequest>,
  reply: FastifyReply
) {
  try {
    const scheduleData = request.body;

    // ✅ SECURITY FIX: Validar conflictos de horario del profesor
    if (scheduleData.teacherId) {
      const conflictingSchedule = await request.tenantPrisma.schedule.findFirst({
        where: {
          teacherId: scheduleData.teacherId,
          dayOfWeek: scheduleData.dayOfWeek,
          OR: [
            {
              // Caso 1: Nueva clase empieza durante clase existente
              AND: [
                { startTime: { lte: scheduleData.startTime } },
                { endTime: { gt: scheduleData.startTime } }
              ]
            },
            {
              // Caso 2: Nueva clase termina durante clase existente
              AND: [
                { startTime: { lt: scheduleData.endTime } },
                { endTime: { gte: scheduleData.endTime } }
              ]
            },
            {
              // Caso 3: Nueva clase envuelve clase existente
              AND: [
                { startTime: { gte: scheduleData.startTime } },
                { endTime: { lte: scheduleData.endTime } }
              ]
            }
          ]
        },
        include: {
          classroom: { select: { name: true } },
          subject: { select: { name: true } }
        }
      });

      if (conflictingSchedule) {
        return reply.status(409).send({
          error: `El profesor ya tiene clase de ${conflictingSchedule.subject?.name || 'una materia'} en ${conflictingSchedule.classroom?.name || 'otra aula'} el ${scheduleData.dayOfWeek} de ${conflictingSchedule.startTime} a ${conflictingSchedule.endTime}`,
          code: 'TEACHER_SCHEDULE_CONFLICT',
          conflict: {
            classroom: conflictingSchedule.classroom?.name,
            subject: conflictingSchedule.subject?.name,
            time: `${conflictingSchedule.startTime} - ${conflictingSchedule.endTime}`
          }
        });
      }
    }

    // Validar conflicto de aula (ya existía)
    const existingSchedule = await request.tenantPrisma.schedule.findFirst({
      where: {
        dayOfWeek: scheduleData.dayOfWeek,
        startTime: scheduleData.startTime,
        classroomId: scheduleData.classroomId,
      },
    });

    if (existingSchedule) {
      return reply.status(409).send({
        error: 'Ya existe un horario para esta clase en ese momento',
        code: 'SCHEDULE_EXISTS',
      });
    }

    const schedule = await request.tenantPrisma.schedule.create({
      data: {
        ...scheduleData as any,
      },
    });

    logger.info('Nuevo horario creado', { scheduleId: schedule.id });

    return reply.status(201).send({ schedule });
  } catch (error: any) {
    logger.error('Error al crear horario', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener todos los horarios
 */
export async function getSchedules(
  request: FastifyRequest<GetSchedulesRequest>,
  reply: FastifyReply
) {
  try {
    const {
      page = 1,
      limit = 20,
      classroomId,
      teacherId,
      subjectId,
      dayOfWeek,
      timeFrom,
      timeTo,
    } = request.query;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {
    };

    if (classroomId) {
      where.classroomId = classroomId;
    }

    if (teacherId) {
      where.teacherId = teacherId;
    }

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (dayOfWeek) {
      where.dayOfWeek = dayOfWeek;
    }

    if (timeFrom || timeTo) {
      where.AND = [];
      if (timeFrom) {
        where.AND.push({ startTime: { gte: timeFrom } });
      }
      if (timeTo) {
        where.AND.push({ endTime: { lte: timeTo } });
      }
    }

    // Obtener horarios y total
    const [schedules, total] = await Promise.all([
      request.tenantPrisma.schedule.findMany({
        where,
        skip,
        take: limit,
        include: {
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              section: true,
            },
          },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: [
          { dayOfWeek: 'asc' },
          { startTime: 'asc' },
        ],
      }),
      request.tenantPrisma.schedule.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return reply.status(200).send({
      schedules,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error('Error al obtener horarios', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener un horario por ID
 */
export async function getSchedule(
  request: FastifyRequest<GetScheduleRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    const schedule = await request.tenantPrisma.schedule.findFirst({
      where: {
        id,
      },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
            description: true,
          },
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            specialization: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
          },
        },
      },
    });

    if (!schedule) {
      return reply.status(404).send({
        error: 'Horario no encontrado',
        code: 'SCHEDULE_NOT_FOUND',
      });
    }

    return reply.status(200).send({ schedule });
  } catch (error) {
    logger.error('Error al obtener horario', { error, scheduleId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para actualizar un horario
 */
export async function updateSchedule(
  request: FastifyRequest<UpdateScheduleRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const updateData = request.body;

    // Verificar que el horario existe
    const existingSchedule = await request.tenantPrisma.schedule.findFirst({
      where: {
        id,
      },
    });

    if (!existingSchedule) {
      return reply.status(404).send({
        error: 'Horario no encontrado',
        code: 'SCHEDULE_NOT_FOUND',
      });
    }

    // Verificar conflictos de horario si se cambian los datos clave
    if (
      updateData.dayOfWeek ||
      updateData.startTime ||
      updateData.endTime ||
      updateData.classroomId ||
      updateData.teacherId
    ) {
      const conflictWhere = {
        dayOfWeek: updateData.dayOfWeek || existingSchedule.dayOfWeek,
        classroomId: updateData.classroomId || existingSchedule.classroomId,
        id: { not: id },
        OR: [
          // Horario que comienza durante otro
          {
            startTime: {
              lt: updateData.endTime || existingSchedule.endTime,
            },
            endTime: {
              gt: updateData.startTime || existingSchedule.startTime,
            },
          },
        ],
      };

      const conflictingSchedule = await request.tenantPrisma.schedule.findFirst({
        where: conflictWhere,
      });

      if (conflictingSchedule) {
        return reply.status(409).send({
          error: 'Existe conflicto de horario con otra clase',
          code: 'SCHEDULE_CONFLICT',
        });
      }

      // Verificar conflicto de profesor
      if (updateData.teacherId) {
        const teacherConflict = await request.tenantPrisma.schedule.findFirst({
          where: {
            dayOfWeek: updateData.dayOfWeek || existingSchedule.dayOfWeek,
            teacherId: updateData.teacherId,
            id: { not: id },
            OR: [
              {
                startTime: {
                  lt: updateData.endTime || existingSchedule.endTime,
                },
                endTime: {
                  gt: updateData.startTime || existingSchedule.startTime,
                },
              },
            ],
          },
        });

        if (teacherConflict) {
          return reply.status(409).send({
            error: 'El profesor ya tiene clase asignada en ese horario',
            code: 'TEACHER_SCHEDULE_CONFLICT',
          });
        }
      }
    }

    // Actualizar el horario
    const schedule = await request.tenantPrisma.schedule.update({
      where: { id },
      data: updateData,
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
          },
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Registrar el evento de actualización
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'SCHEDULE',
        entityType: 'SCHEDULE',
        entityId: schedule.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          changes: updateData as any,
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Horario actualizado', { scheduleId: schedule.id });

    return reply.status(200).send({ schedule });
  } catch (error) {
    logger.error('Error al actualizar horario', { error, scheduleId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para eliminar un horario
 */
export async function deleteSchedule(
  request: FastifyRequest<DeleteScheduleRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    // Solo administradores y profesores pueden eliminar horarios
    const role = request.user?.role;
    if (!(role === UserRole.ADMIN || role === UserRole.TEACHER)) {
      return reply.status(403).send({
        error: 'No tienes permisos para eliminar horarios',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Verificar que el horario existe
    const existingSchedule = await request.tenantPrisma.schedule.findFirst({
      where: {
        id,
      },
      include: {
        classroom: {
          select: {
            name: true,
          },
        },
        subject: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!existingSchedule) {
      return reply.status(404).send({
        error: 'Horario no encontrado',
        code: 'SCHEDULE_NOT_FOUND',
      });
    }

    // Eliminar el horario
    await request.tenantPrisma.schedule.delete({
      where: { id },
    });

    // Registrar el evento de eliminación
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.DELETE,
        entity: 'SCHEDULE',
        entityType: 'SCHEDULE',
        entityId: id,
        metadata: ({
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          deletedSchedule: {
            classroom: existingSchedule.classroom.name,
            subject: existingSchedule.subject.name,
            dayOfWeek: existingSchedule.dayOfWeek,
            startTime: existingSchedule.startTime,
          },
        }),
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Horario eliminado', { scheduleId: id });

    return reply.status(200).send({
      message: 'Horario eliminado correctamente',
    });
  } catch (error) {
    logger.error('Error al eliminar horario', { error, scheduleId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener horarios por aula
 */
export async function getClassroomSchedules(
  request: FastifyRequest<GetClassroomSchedulesRequest>,
  reply: FastifyReply
) {
  try {
    const { classroomId } = request.params;
    const { dayOfWeek } = request.query;

    // Verificar que el aula existe
    const classroom = await request.tenantPrisma.classroom.findFirst({
      where: {
        id: classroomId,
      },
    });

    if (!classroom) {
      return reply.status(404).send({
        error: 'Aula no encontrada',
        code: 'CLASSROOM_NOT_FOUND',
      });
    }

    // Construir filtros
    const where: any = {
      classroomId,
    };

    if (dayOfWeek) {
      where.dayOfWeek = dayOfWeek;
    }

    const schedules = await request.tenantPrisma.schedule.findMany({
      where,
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });

    // Agrupar por día de la semana
    const schedulesByDay = schedules.reduce((acc, schedule) => {
      const day = schedule.dayOfWeek;
      if (!acc[day]) {
        acc[day] = [];
      }
      acc[day].push(schedule);
      return acc;
    }, {} as Record<string, typeof schedules>);

    return reply.status(200).send({
      classroom: {
        id: classroom.id,
        name: classroom.name,
        grade: classroom.grade,
        section: classroom.section,
      },
      schedules: dayOfWeek ? schedules : schedulesByDay,
      totalSchedules: schedules.length,
    });
  } catch (error) {
    logger.error('Error al obtener horarios del aula', { error, classroomId: request.params.classroomId });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener horarios de un profesor
 */
export async function getTeacherSchedules(
  request: FastifyRequest<{ Params: { teacherId: string } }>,
  reply: FastifyReply
) {
  try {
    const { teacherId } = request.params;

    // Verificar que el profesor existe
    const teacher = await request.tenantPrisma.user.findFirst({
      where: {
        id: teacherId,
        role: UserRole.TEACHER,
      },
    });

    if (!teacher) {
      return reply.status(404).send({
        error: 'Profesor no encontrado',
        code: 'TEACHER_NOT_FOUND',
      });
    }

    const schedules = await request.tenantPrisma.schedule.findMany({
      where: {
        teacherId,
      },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });

    // Agrupar por día de la semana
    const schedulesByDay = schedules.reduce((acc, schedule) => {
      const day = schedule.dayOfWeek;
      if (!acc[day]) {
        acc[day] = [];
      }
      acc[day].push(schedule);
      return acc;
    }, {} as Record<string, typeof schedules>);

    return reply.status(200).send({
      teacher: {
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        specialization: teacher.specialization,
      },
      schedules: schedulesByDay,
      totalSchedules: schedules.length,
    });
  } catch (error) {
    logger.error('Error al obtener horarios del profesor', { error, teacherId: request.params.teacherId });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
