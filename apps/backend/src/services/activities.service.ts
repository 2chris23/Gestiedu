import { ActivityType, ActivityScope, UserRole } from '../utils/prisma-enums';
import { PrismaClient } from '@prisma/client';
import { AppErrors } from '../middleware/error.middleware';
import { RedisCache } from '../config/redis';
import { CACHE_TTL, PAGINATION } from '../utils/constants';

export interface CreateActivityData {
  title: string;
  description?: string;
  type: ActivityType;
  scope: ActivityScope;
  startDate: Date;
  endDate?: Date;
  dueDate?: Date;
  maxGrade?: number;
  weight?: number;
  isVisible?: boolean;
  periodId?: string;
  subjectId?: string;
  classroomId?: string;
  createdBy: string;
  instituteId: string;
}

export interface UpdateActivityData {
  title?: string;
  description?: string;
  type?: ActivityType;
  scope?: ActivityScope;
  startDate?: Date;
  endDate?: Date;
  dueDate?: Date;
  maxGrade?: number;
  weight?: number;
  isVisible?: boolean;
  periodId?: string;
  subjectId?: string;
  classroomId?: string;
}

export interface GetActivitiesQuery {
  page?: number;
  limit?: number;
  type?: ActivityType;
  scope?: ActivityScope;
  subjectId?: string;
  classroomId?: string;
  periodId?: string;
  startDate?: Date;
  endDate?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeInvisible?: boolean;
  createdBy?: string;
  instituteId: string;
}

export interface ActivityWithRelations {
  id: string;
  title: string;
  description?: string;
  type: ActivityType;
  scope: ActivityScope;
  startDate: Date;
  endDate?: Date;
  dueDate?: Date;
  maxGrade: number;
  weight: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
  creator: {
    id: string;
    firstName: string;
    lastName: string;
  };
  period?: {
    id: string;
    name: string;
  } | null;
  subject?: {
    id: string;
    name: string;
    code: string;
  } | null;
  classroom?: {
    id: string;
    name: string;
    section: string;
    grade: number;
  } | null;
  institute: {
    id: string;
    name: string;
    code: string;
  };
  _count?: {
    grades: number;
  };
}

class ActivitiesService {
  /**
   * Crear nueva actividad
   */
  async createActivity(prisma: PrismaClient, activityData: CreateActivityData): Promise<ActivityWithRelations> {
    const {
      title,
      description,
      type,
      scope,
      startDate,
      endDate,
      dueDate,
      maxGrade = 20,
      weight = 1,
      isVisible = true,
      periodId,
      subjectId,
      classroomId,
      createdBy,
      instituteId,
    } = activityData;

    // Validaciones de fechas
    if (endDate && endDate < startDate) {
      throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
    }

    if (dueDate && dueDate < startDate) {
      throw new Error('La fecha límite debe ser posterior a la fecha de inicio');
    }

    // Validar maxGrade
    if (maxGrade < 1 || maxGrade > 20) {
      throw new Error('La calificación máxima debe estar entre 1 y 20');
    }

    // Validar weight
    if (weight < 0.1 || weight > 10) {
      throw new Error('El peso debe estar entre 0.1 y 10');
    }

    // Verificar que el creador existe
    const creator = await prisma.user.findUnique({
      where: { id: createdBy },
      select: { id: true, role: true, instituteId: true },
    });

    if (!creator) {
      throw AppErrors.UserNotFound();
    }

    if (creator.instituteId !== instituteId) {
      throw AppErrors.Forbidden('No puedes crear actividades en otro instituto');
    }

    // Verificar entidades relacionadas según el scope
    if (scope === ActivityScope.CLASSROOM && !classroomId) {
      throw new Error('Se requiere ID de aula para actividades de alcance CLASSROOM');
    }

    if (scope === ActivityScope.GRADE && !classroomId) {
      throw new Error('Se requiere ID de aula para actividades de alcance GRADE');
    }

    // Verificar que las entidades relacionadas existen y pertenecen al instituto
    const validations = [];

    if (periodId) {
      validations.push(
        prisma.period.findFirst({
          where: {
            id: periodId,
            academicYear: { instituteId }
          }
        }).then(p => ({ type: 'period', exists: !!p }))
      );
    }

    if (subjectId) {
      validations.push(
        prisma.subject.findFirst({
          where: { id: subjectId, instituteId }
        }).then(s => ({ type: 'subject', exists: !!s }))
      );
    }

    if (classroomId) {
      validations.push(
        prisma.classroom.findFirst({
          where: { id: classroomId, instituteId }
        }).then(c => ({ type: 'classroom', exists: !!c }))
      );
    }

    const validationResults = await Promise.all(validations);
    const invalidEntity = validationResults.find(r => !r.exists);

    if (invalidEntity) {
      throw new Error(`${invalidEntity.type} no encontrado o no pertenece al instituto`);
    }

    // Crear actividad
    const activity = await prisma.activity.create({
      data: {
        title,
        description,
        type,
        scope,
        startDate,
        endDate,
        dueDate,
        maxGrade,
        weight,
        isVisible,
        periodId,
        subjectId,
        classroomId,
        createdBy,
        instituteId,
      },
    });

    // Limpiar cache relacionado
    await this.clearActivityCache(instituteId, classroomId, subjectId);

    return this.getActivityById(prisma, activity.id);
  }

  /**
   * Obtener actividad por ID
   */
  async getActivityById(prisma: PrismaClient, id: string): Promise<ActivityWithRelations> {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        period: {
          select: {
            id: true,
            name: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
            grade: true,
          },
        },
        institute: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            grades: true,
          },
        },
      },
    });

    if (!activity) {
      throw new Error('Actividad no encontrada');
    }

    return activity as unknown as ActivityWithRelations;
  }

  /**
   * Obtener lista de actividades con filtros
   */
  async getActivities(prisma: PrismaClient, query: GetActivitiesQuery): Promise<{
    activities: ActivityWithRelations[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      type,
      scope,
      subjectId,
      classroomId,
      periodId,
      startDate,
      endDate,
      sortBy = 'startDate',
      sortOrder = 'asc',
      includeInvisible = false,
      createdBy,
      instituteId,
    } = query;

    const offset = (page - 1) * limit;

    // Construir filtros
    const where: any = {
      instituteId,
    };

    if (!includeInvisible) {
      where.isVisible = true;
    }

    if (type) where.type = type;
    if (scope) where.scope = scope;
    if (subjectId) where.subjectId = subjectId;
    if (classroomId) where.classroomId = classroomId;
    if (periodId) where.periodId = periodId;
    if (createdBy) where.createdBy = createdBy;

    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) where.startDate.gte = startDate;
      if (endDate) where.startDate.lte = endDate;
    }

    // Contar total
    const total = await prisma.activity.count({ where });

    // Obtener actividades
    const activities = await prisma.activity.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        period: {
          select: {
            id: true,
            name: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
            grade: true,
          },
        },
        institute: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            grades: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: offset,
      take: limit,
    });

    return {
      activities: activities as unknown as ActivityWithRelations[],
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Actualizar actividad
   */
  async updateActivity(prisma: PrismaClient, id: string, updateData: UpdateActivityData): Promise<ActivityWithRelations> {
    const { maxGrade, weight, startDate, endDate, dueDate, ...otherData } = updateData;

    // Validaciones
    if (maxGrade && (maxGrade < 1 || maxGrade > 20)) {
      throw new Error('La calificación máxima debe estar entre 1 y 20');
    }

    if (weight && (weight < 0.1 || weight > 10)) {
      throw new Error('El peso debe estar entre 0.1 y 10');
    }

    // Verificar que la actividad existe
    const existingActivity = await prisma.activity.findUnique({
      where: { id },
      select: {
        id: true,
        instituteId: true,
        classroomId: true,
        subjectId: true,
        startDate: true,
      },
    });

    if (!existingActivity) {
      throw new Error('Actividad no encontrada');
    }

    // Validaciones de fechas
    const newStartDate = startDate || existingActivity.startDate;

    if (endDate && endDate < newStartDate) {
      throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
    }

    if (dueDate && dueDate < newStartDate) {
      throw new Error('La fecha límite debe ser posterior a la fecha de inicio');
    }

    // Actualizar actividad
    await prisma.activity.update({
      where: { id },
      data: {
        ...otherData,
        ...(maxGrade && { maxGrade }),
        ...(weight && { weight }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(dueDate && { dueDate }),
      },
    });

    // Limpiar cache relacionado
    await this.clearActivityCache(
      existingActivity.instituteId!,
      existingActivity.classroomId!,
      existingActivity.subjectId!
    );

    return this.getActivityById(prisma, id);
  }

  /**
   * Eliminar actividad
   */
  async deleteActivity(prisma: PrismaClient, id: string): Promise<void> {
    // Verificar que la actividad existe
    const activity = await prisma.activity.findUnique({
      where: { id },
      select: {
        id: true,
        instituteId: true,
        classroomId: true,
        subjectId: true,
        _count: {
          select: {
            grades: true,
          },
        },
      },
    });

    if (!activity) {
      throw new Error('Actividad no encontrada');
    }

    // Verificar si la actividad tiene calificaciones
    if (activity._count.grades > 0) {
      throw new Error('No se puede eliminar una actividad que tiene calificaciones');
    }

    // Eliminar actividad
    await prisma.activity.delete({
      where: { id },
    });

    // Limpiar cache relacionado
    await this.clearActivityCache(
      activity.instituteId!,
      activity.classroomId!,
      activity.subjectId!
    );
  }

  /**
   * Obtener actividades próximas a vencer
   */
  async getUpcomingActivities(
    prisma: PrismaClient,
    instituteId: string,
    userId?: string,
    days: number = 7
  ): Promise<ActivityWithRelations[]> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + days);

    const where: any = {
      instituteId,
      isVisible: true,
      dueDate: {
        gte: now,
        lte: futureDate,
      },
    };

    // Si se proporciona userId, filtrar por actividades relevantes para ese usuario
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (user?.role === UserRole.STUDENT) {
        // Para estudiantes, mostrar actividades de sus aulas
        const studentClassrooms = await prisma.studentClassroom.findMany({
          where: { studentId: userId, isActive: true },
          select: { classroomId: true },
        });

        const classroomIds = studentClassrooms.map(sc => sc.classroomId);

        where.OR = [
          { scope: ActivityScope.GLOBAL },
          { classroomId: { in: classroomIds } },
        ];
      } else if (user?.role === UserRole.TEACHER) {
        // Para profesores, mostrar actividades de sus aulas o que crearon
        const teacherClassrooms = await prisma.teacherClassroom.findMany({
          where: { teacherId: userId },
          select: { classroomId: true },
        });

        const classroomIds = teacherClassrooms.map(tc => tc.classroomId);

        where.OR = [
          { scope: ActivityScope.GLOBAL },
          { classroomId: { in: classroomIds } },
          { createdBy: userId },
        ];
      }
      // Para admins, mostrar todas (no agregar filtros adicionales)
    }

    const activities = await prisma.activity.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
            grade: true,
          },
        },
        institute: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
      take: 20, // Limitar a 20 actividades próximas
    });

    return activities as unknown as ActivityWithRelations[];
  }

  /**
   * Obtener actividades por rango de fechas (para calendario)
   */
  async getActivitiesByDateRange(
    prisma: PrismaClient,
    instituteId: string,
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<ActivityWithRelations[]> {
    const where: any = {
      instituteId,
      isVisible: true,
      OR: [
        {
          startDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        {
          dueDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      ],
    };

    // Aplicar filtros por rol si se proporciona userId
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (user?.role === UserRole.STUDENT) {
        const studentClassrooms = await prisma.studentClassroom.findMany({
          where: { studentId: userId, isActive: true },
          select: { classroomId: true },
        });

        const classroomIds = studentClassrooms.map(sc => sc.classroomId);

        where.AND = [
          where.OR,
          {
            OR: [
              { scope: ActivityScope.GLOBAL },
              { classroomId: { in: classroomIds } },
            ],
          },
        ];
        delete where.OR;
      } else if (user?.role === UserRole.TEACHER) {
        const teacherClassrooms = await prisma.teacherClassroom.findMany({
          where: { teacherId: userId },
          select: { classroomId: true },
        });

        const classroomIds = teacherClassrooms.map(tc => tc.classroomId);

        where.AND = [
          where.OR,
          {
            OR: [
              { scope: ActivityScope.GLOBAL },
              { classroomId: { in: classroomIds } },
              { createdBy: userId },
            ],
          },
        ];
        delete where.OR;
      }
    }

    const activities = await prisma.activity.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        period: {
          select: {
            id: true,
            name: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            section: true,
            grade: true,
          },
        },
        institute: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    return activities as unknown as ActivityWithRelations[];
  }

  /**
   * Limpiar cache de actividades
   */
  private async clearActivityCache(
    instituteId: string,
    classroomId?: string,
    subjectId?: string
  ): Promise<void> {
    await RedisCache.clearPattern(`activities:institute:${instituteId}:*`);

    if (classroomId) {
      await RedisCache.clearPattern(`activities:classroom:${classroomId}:*`);
    }

    if (subjectId) {
      await RedisCache.clearPattern(`activities:subject:${subjectId}:*`);
    }
  }
}

export const activitiesService = new ActivitiesService();
export default activitiesService;
