import { Schedule, PrismaClient } from '@prisma/client';
import { UserRole, DayOfWeek } from '../utils/prisma-enums';
import { RedisCache } from '../config/redis';
import { AppErrors, createError } from '../middleware/error.middleware';
import { CreateScheduleDto, UpdateScheduleDto, ScheduleFiltersDto } from '../dto/schedule.dto';
import { PaginationInput } from '../utils/validators';

export class SchedulesService {
  constructor() { }

  // Crear horario
  async create(prisma: PrismaClient, data: CreateScheduleDto, userId: string): Promise<Schedule> {
    // Verificar permisos
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, instituteId: true }
    });

    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.TEACHER)) {
      throw AppErrors.Forbidden('No tienes permisos para crear horarios');
    }

    // Verificar que el aula existe
    const classroom = await prisma.classroom.findUnique({
      where: { id: data.classroomId },
      select: { instituteId: true, isActive: true }
    });

    if (!classroom || !classroom.isActive) {
      throw createError(404, 'Aula no encontrada o inactiva');
    }

    // Verificar que la materia existe
    const subject = await prisma.subject.findUnique({
      where: { id: data.subjectId },
      select: { instituteId: true }
    });

    if (!subject) {
      throw createError(404, 'Materia no encontrada');
    }

    // Verificar permisos de instituto
    if (user.role !== UserRole.ADMIN && user.instituteId !== classroom.instituteId) {
      throw createError(403, 'No tienes permisos para crear horarios en este instituto');
    }

    if (classroom.instituteId !== subject.instituteId) {
      throw createError(400, 'El aula y la materia deben pertenecer al mismo instituto');
    }

    // Validar formato de horas
    if (!this.isValidTimeFormat(data.startTime) || !this.isValidTimeFormat(data.endTime)) {
      throw createError(400, 'Formato de hora inválido. Use HH:mm (ej: 08:30)');
    }

    // Validar que la hora de inicio sea anterior a la hora de fin
    if (data.startTime >= data.endTime) {
      throw createError(400, 'La hora de inicio debe ser anterior a la hora de fin');
    }

    // Verificar que no haya conflictos de horario en el aula
    const conflictingSchedule = await prisma.schedule.findFirst({
      where: {
        classroomId: data.classroomId,
        dayOfWeek: data.dayOfWeek,
        OR: [
          // Nuevo horario empieza durante uno existente
          {
            startTime: { lte: data.startTime },
            endTime: { gt: data.startTime }
          },
          // Nuevo horario termina durante uno existente
          {
            startTime: { lt: data.endTime },
            endTime: { gte: data.endTime }
          },
          // Nuevo horario engloba uno existente
          {
            startTime: { gte: data.startTime },
            endTime: { lte: data.endTime }
          }
        ]
      }
    });

    if (conflictingSchedule) {
      throw createError(409, 'Ya existe un horario en este aula para el mismo día y hora');
    }

    const schedule = await prisma.schedule.create({
      data: {
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        room: data.room,
        notes: data.notes,
        classroom: { connect: { id: data.classroomId } },
        subject: { connect: { id: data.subjectId } },
        teacher: { connect: { id: data.teacherId } },
        institute: { connect: { id: classroom.instituteId! } }
      },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true
          }
        },
        institute: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Limpiar caches relacionados
    await this.clearScheduleCaches(classroom.instituteId!, data.classroomId);

    return schedule;
  }

  // Obtener horario por ID
  async findById(prisma: PrismaClient, id: string, userId: string): Promise<Schedule> {
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
            instituteId: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true
          }
        },
        institute: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!schedule) {
      throw createError(404, 'Horario no encontrado');
    }

    // Verificar permisos
    await this.checkScheduleAccess(prisma, schedule.classroom.instituteId!, userId);

    return schedule;
  }

  // Listar horarios con filtros
  async findMany(
    prisma: PrismaClient,
    filters: ScheduleFiltersDto,
    pagination: PaginationInput,
    userId: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, instituteId: true }
    });

    if (!user) {
      throw createError(404, 'Usuario no encontrado');
    }

    // Determinar el instituto a filtrar
    let instituteId = filters.instituteId;
    if (user.role !== UserRole.ADMIN) {
      instituteId = user.instituteId ?? undefined;
    }

    if (!instituteId) {
      throw createError(400, 'Instituto requerido');
    }

    const where: any = {
      instituteId
    };

    // Aplicar filtros
    if (filters.classroomId) {
      where.classroomId = filters.classroomId;
    }

    if (filters.subjectId) {
      where.subjectId = filters.subjectId;
    }

    if (filters.dayOfWeek) {
      where.dayOfWeek = filters.dayOfWeek;
    }

    if (filters.grade) {
      where.classroom = {
        grade: filters.grade
      };
    }

    const [schedules, total] = await Promise.all([
      prisma.schedule.findMany({
        where,
        include: {
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              section: true
            }
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
              color: true
            }
          }
        },
        orderBy: [
          { dayOfWeek: 'asc' },
          { startTime: 'asc' },
          { classroom: { grade: 'asc' } },
          { classroom: { section: 'asc' } }
        ],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit
      }),
      prisma.schedule.count({ where })
    ]);

    return {
      schedules,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };
  }

  // Obtener horario por aula
  async getByClassroom(prisma: PrismaClient, classroomId: string, userId: string) {
    // Verificar que el aula existe
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, instituteId: true, isActive: true, name: true, grade: true, section: true }
    });

    if (!classroom || !classroom.isActive) {
      throw createError(404, 'Aula no encontrada o inactiva');
    }

    // Verificar permisos
    await this.checkScheduleAccess(prisma, classroom.instituteId!, userId);

    const cacheKey = `schedule:classroom:${classroomId}`;
    const cached = await RedisCache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached as string);
    }

    const schedules = await prisma.schedule.findMany({
      where: { classroomId },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true
          }
        }
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });

    // Organizar por días de la semana
    const scheduleByDay: Record<string, any[]> = {
      LUNES: [],
      MARTES: [],
      MIERCOLES: [],
      JUEVES: [],
      VIERNES: [],
      SABADO: [],
      DOMINGO: []
    };

    schedules.forEach(schedule => {
      scheduleByDay[schedule.dayOfWeek].push(schedule);
    });

    const result = {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        grade: classroom.grade,
        section: classroom.section
      },
      scheduleByDay,
      totalHours: schedules.reduce((total, schedule) => {
        const start = this.timeToMinutes(schedule.startTime);
        const end = this.timeToMinutes(schedule.endTime);
        return total + (end - start);
      }, 0) / 60 // Convertir a horas
    };

    // Cachear por 30 minutos
    await RedisCache.set(cacheKey, JSON.stringify(result), 1800);

    return result;
  }

  // Obtener horario por instituto (vista general)
  async getByInstitute(prisma: PrismaClient, instituteId: string, userId: string) {
    // Verificar permisos
    await this.checkScheduleAccess(prisma, instituteId, userId);

    const cacheKey = `schedule:institute:${instituteId}`;
    const cached = await RedisCache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached as string);
    }

    const schedules = await prisma.schedule.findMany({
      where: { instituteId },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true
          }
        }
      },
      orderBy: [
        { classroom: { grade: 'asc' } },
        { classroom: { section: 'asc' } },
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });

    // Organizar por aulas
    const schedulesByClassroom = schedules.reduce((acc: Record<string, any>, schedule) => {
      const key = schedule.classroomId;
      if (!acc[key]) {
        acc[key] = {
          classroom: schedule.classroom,
          schedules: []
        };
      }
      acc[key].schedules.push({
        id: schedule.id,
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        subject: schedule.subject
      });
      return acc;
    }, {});

    const result = {
      instituteId,
      totalClassrooms: Object.keys(schedulesByClassroom).length,
      totalSchedules: schedules.length,
      schedulesByClassroom: Object.values(schedulesByClassroom)
    };

    // Cachear por 20 minutos
    await RedisCache.set(cacheKey, JSON.stringify(result), 1200);

    return result;
  }

  // Actualizar horario
  async update(prisma: PrismaClient, id: string, data: UpdateScheduleDto, userId: string): Promise<Schedule> {
    const existingSchedule = await prisma.schedule.findUnique({
      where: { id },
      select: { instituteId: true, classroomId: true, subjectId: true }
    });

    if (!existingSchedule) {
      throw createError(404, 'Horario no encontrado');
    }

    // Verificar permisos
    await this.checkScheduleAccess(prisma, existingSchedule.instituteId!, userId, true);

    // Validar formato de horas si se proporcionan
    if (data.startTime && !this.isValidTimeFormat(data.startTime)) {
      throw createError(400, 'Formato de hora de inicio inválido. Use HH:mm');
    }

    if (data.endTime && !this.isValidTimeFormat(data.endTime)) {
      throw createError(400, 'Formato de hora de fin inválido. Use HH:mm');
    }

    // Validar que la hora de inicio sea anterior a la hora de fin
    const startTime = data.startTime || (await prisma.schedule.findUnique({ where: { id }, select: { startTime: true } }))?.startTime;
    const endTime = data.endTime || (await prisma.schedule.findUnique({ where: { id }, select: { endTime: true } }))?.endTime;

    if (startTime && endTime && startTime >= endTime) {
      throw createError(400, 'La hora de inicio debe ser anterior a la hora de fin');
    }

    // Verificar conflictos de horario si se cambian las horas o el día
    if (data.dayOfWeek || data.startTime || data.endTime) {
      const dayOfWeek = data.dayOfWeek || (await prisma.schedule.findUnique({ where: { id }, select: { dayOfWeek: true } }))?.dayOfWeek;

      const conflictingSchedule = await prisma.schedule.findFirst({
        where: {
          id: { not: id },
          classroomId: existingSchedule.classroomId,
          dayOfWeek,
          OR: [
            {
              startTime: { lte: startTime },
              endTime: { gt: startTime }
            },
            {
              startTime: { lt: endTime },
              endTime: { gte: endTime }
            },
            {
              startTime: { gte: startTime },
              endTime: { lte: endTime }
            }
          ]
        }
      });

      if (conflictingSchedule) {
        throw createError(409, 'El horario actualizado se solapa con un horario existente');
      }
    }

    const schedule = await prisma.schedule.update({
      where: { id },
      data: {
        ...(data.dayOfWeek && { dayOfWeek: data.dayOfWeek }),
        ...(data.startTime && { startTime: data.startTime }),
        ...(data.endTime && { endTime: data.endTime })
      },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true
          }
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true
          }
        },
        institute: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Limpiar caches
    await this.clearScheduleCaches(existingSchedule.instituteId!, existingSchedule.classroomId);

    return schedule;
  }

  // Verificar disponibilidad de horario
  async checkAvailability(
    prisma: PrismaClient,
    classroomId: string,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
    userId: string,
    excludeScheduleId?: string
  ): Promise<{ available: boolean; conflicts?: any[] }> {
    // Verificar que el aula existe
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { instituteId: true, isActive: true }
    });

    if (!classroom || !classroom.isActive) {
      throw createError(404, 'Aula no encontrada o inactiva');
    }

    // Verificar permisos
    await this.checkScheduleAccess(prisma, classroom.instituteId!, userId);

    // Validar formato de horas
    if (!this.isValidTimeFormat(startTime) || !this.isValidTimeFormat(endTime)) {
      throw createError(400, 'Formato de hora inválido. Use HH:mm');
    }

    if (startTime >= endTime) {
      throw createError(400, 'La hora de inicio debe ser anterior a la hora de fin');
    }

    const where: any = {
      classroomId,
      dayOfWeek,
      OR: [
        {
          startTime: { lte: startTime },
          endTime: { gt: startTime }
        },
        {
          startTime: { lt: endTime },
          endTime: { gte: endTime }
        },
        {
          startTime: { gte: startTime },
          endTime: { lte: endTime }
        }
      ]
    };

    if (excludeScheduleId) {
      where.id = { not: excludeScheduleId };
    }

    const conflicts = await prisma.schedule.findMany({
      where,
      include: {
        subject: {
          select: {
            name: true,
            code: true
          }
        }
      }
    });

    return {
      available: conflicts.length === 0,
      conflicts: conflicts.length > 0 ? conflicts : undefined
    };
  }

  // Métodos auxiliares privados
  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private async checkScheduleAccess(prisma: PrismaClient, instituteId: string, userId: string, requireWrite = false): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, instituteId: true }
    });

    if (!user) {
      throw createError(404, 'Usuario no encontrado');
    }

    // Admin puede acceder a todo
    if (user.role === UserRole.ADMIN) {
      return;
    }

    // Profesor puede ver (no escribir) horarios de su instituto
    if (!requireWrite && user.role === UserRole.TEACHER && user.instituteId === instituteId) {
      return;
    }

    throw createError(
      403,
      requireWrite
        ? 'No tienes permisos para modificar horarios'
        : 'No tienes permisos para acceder a esta información'
    );
  }

  private async clearScheduleCaches(instituteId: string, classroomId?: string): Promise<void> {
    const patterns = [
      `schedule:classroom:${classroomId}`,
      `schedule:institute:${instituteId}`
    ].filter(Boolean);

    await Promise.all(patterns.map(pattern => RedisCache.del(pattern)));
  }
}
