import { DailyAttendance, PrismaClient } from '@prisma/client';
import { UserRole, AttendanceStatus } from '../utils/prisma-enums';
import { CreateAttendanceInput, UpdateAttendanceInput, PaginationInput } from '../utils/validators';
import { RedisCache } from '../config/redis';
import { NotFoundError, AuthorizationError, ConflictError, ValidationError } from '../utils/errors';
import { invalidateClassroomAttendanceCache } from '../utils/cache-invalidation';

// Tipos locales para attendance (reemplazan class-validator DTOs)
interface AttendanceFilters {
  studentId?: string;
  subjectId?: string;
  classroomId?: string;
  teacherId?: string;
  status?: AttendanceStatus;
  periodId?: string;
  dateFrom?: string;
  dateTo?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
}

interface StudentAttendanceEntry {
  studentId: string;
  status: AttendanceStatus;
  comments?: string;
}

interface MarkClassAttendanceData {
  classroomId: string;
  subjectId: string;
  date: string;
  students: StudentAttendanceEntry[];
  attendances: StudentAttendanceEntry[];
}

export class AttendanceService {

  // Registrar asistencia individual
  async create(prisma: PrismaClient, data: CreateAttendanceInput, userId: string): Promise<DailyAttendance> {
    // Verificar que el usuario tenga permisos (admin, coordinator o teacher)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, instituteId: true }
    });

    if (!user || !(user.role === UserRole.ADMIN || user.role === UserRole.TEACHER)) {
      throw new AuthorizationError('No tienes permisos para registrar asistencia');
    }

    // Verificar que el estudiante existe y pertenece al instituto
    const student = await prisma.user.findUnique({
      where: { id: data.studentId },
      select: { role: true, instituteId: true, isActive: true }
    });

    if (!student || !student.isActive) {
      throw new NotFoundError('Estudiante', data.studentId);
    }

    if (student.role !== UserRole.STUDENT) {
      throw new ValidationError('El usuario debe ser un estudiante');
    }

    // Verificar que el aula existe y pertenece al instituto
    const classroom = await prisma.classroom.findUnique({
      where: { id: data.classroomId },
      select: { instituteId: true, isActive: true }
    });

    if (!classroom || !classroom.isActive) {
      throw new NotFoundError('Aula', data.classroomId);
    }

    // Verificar permisos de instituto
    if (user.role !== UserRole.ADMIN && user.instituteId !== classroom.instituteId) {
      throw new AuthorizationError('No tienes permisos para registrar asistencia en este instituto');
    }

    if (student.instituteId !== classroom.instituteId) {
      throw new ValidationError('El estudiante no pertenece al mismo instituto del aula');
    }

    // Verificar que no existe ya un registro para este estudiante, aula y fecha
    const existingRecord = await prisma.dailyAttendance.findUnique({
      where: {
        studentId_date: {
          studentId: data.studentId,
          date: data.date
        }
      }
    });

    if (existingRecord) {
      throw new ConflictError('Ya existe un registro de asistencia para este estudiante en esta fecha');
    }

    const attendance = await prisma.dailyAttendance.create({
      data: {
        studentId: data.studentId,
        classroomId: data.classroomId,
        teacherId: userId,
        date: new Date(data.date),
        status: data.status,
        comments: data.comments
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true
          }
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Limpiar caches internos del service
    await this.clearAttendanceCaches(classroom.instituteId!, data.classroomId, data.studentId);

    // Invalidar cache HTTP del sistema de cache diferenciado
    if (classroom.instituteId) {
      await invalidateClassroomAttendanceCache(classroom.instituteId, data.classroomId);
    }

    return attendance;
  }

  // Registrar asistencia masiva (por aula)
  async createBulk(prisma: PrismaClient, data: MarkClassAttendanceData, userId: string): Promise<{ created: number; updated: number }> {
    // Verificar permisos
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, instituteId: true }
    });

    if (!user || !(user.role === UserRole.ADMIN || user.role === UserRole.TEACHER)) {
      throw new AuthorizationError('No tienes permisos para registrar asistencia');
    }

    // Verificar que el aula existe
    const classroom = await prisma.classroom.findUnique({
      where: { id: data.classroomId },
      include: {
        studentClassrooms: {
          where: { isActive: true },
          select: { studentId: true }
        }
      }
    });

    if (!classroom || !classroom.isActive) {
      throw new NotFoundError('Aula', data.classroomId);
    }

    // Verificar permisos de instituto
    if (user.role !== UserRole.ADMIN && user.instituteId !== classroom.instituteId) {
      throw new AuthorizationError('No tienes permisos para registrar asistencia en este instituto');
    }

    // Validar que todos los estudiantes pertenecen al aula
    const classroomStudentIds = classroom.studentClassrooms.map(sc => sc.studentId);
    const invalidStudents = data.attendances.filter(att => !classroomStudentIds.includes(att.studentId));

    if (invalidStudents.length > 0) {
      throw new ValidationError(`Algunos estudiantes no pertenecen al aula: ${invalidStudents.map(s => s.studentId).join(', ')}`);
    }

    // âœ… OPTIMIZADO: Fetch todos los registros existentes de una vez
    const studentIds = data.attendances.map(att => att.studentId);
    const existingRecords = await prisma.dailyAttendance.findMany({
      where: {
        classroomId: data.classroomId,
        date: new Date(data.date),
        studentId: { in: studentIds }
      }
    });

    // Crear un Map para lookups O(1)
    const existingMap = new Map(existingRecords.map(record => [record.studentId, record]));

    // Separar en updates y creates
    const toUpdate: Array<{ id: string; status: AttendanceStatus; comments?: string }> = [];
    const toCreate: Array<{
      studentId: string;
      classroomId: string;
      teacherId: string;
      date: Date;
      status: AttendanceStatus;
      comments?: string;
    }> = [];

    for (const attendanceData of data.attendances) {
      const existingRecord = existingMap.get(attendanceData.studentId);

      if (existingRecord) {
        toUpdate.push({
          id: existingRecord.id,
          status: attendanceData.status,
          comments: attendanceData.comments
        });
      } else {
        toCreate.push({
          studentId: attendanceData.studentId,
          classroomId: data.classroomId,
          teacherId: userId,
          date: new Date(data.date),
          status: attendanceData.status,
          comments: attendanceData.comments
        });
      }
    }

    // âœ… OPTIMIZADO: Ejecutar updates y creates en paralelo
    await Promise.all([
      // Updates individuales en paralelo (Prisma no soporta updateMany con diferentes datos)
      ...toUpdate.map(update =>
        prisma.dailyAttendance.update({
          where: { id: update.id },
          data: {
            status: update.status,
            comments: update.comments,
            teacherId: userId
          }
        })
      ),
      // Creates en bulk
      toCreate.length > 0
        ? prisma.dailyAttendance.createMany({ data: toCreate })
        : Promise.resolve({ count: 0 })
    ]);

    const created = toCreate.length;
    const updated = toUpdate.length;

    // Limpiar caches
    await this.clearAttendanceCaches(classroom.instituteId!, data.classroomId);

    return { created, updated };
  }

  // Obtener registro de asistencia por ID
  async findById(prisma: PrismaClient, id: string, userId: string): Promise<DailyAttendance> {
    const attendance = await prisma.dailyAttendance.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
            instituteId: true
          }
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!attendance) {
      throw new NotFoundError('Registro de asistencia', id);
    }

    // Verificar permisos
    await this.checkAttendanceAccess(prisma, attendance.classroom.instituteId!, userId);

    return attendance;
  }

  // Listar registros de asistencia con filtros
  async findMany(
    prisma: PrismaClient,
    filters: AttendanceFilters,
    pagination: PaginationInput,
    userId: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, instituteId: true }
    });

    if (!user) {
      throw new NotFoundError('Usuario', userId);
    }

    // Determinar el instituto a filtrar (sin usar filters.instituteId que no existe en el DTO)
    const isAdmin = user.role === UserRole.ADMIN;

    const where: any = {};

    // Aplicar filtros
    if (!isAdmin) {
      where.classroom = {
        instituteId: user.instituteId
      };
    }

    if (filters.classroomId) {
      where.classroomId = filters.classroomId;
    }

    if (filters.studentId) {
      where.studentId = filters.studentId;
    }

    if (filters.teacherId) {
      where.teacherId = filters.teacherId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) {
        where.date.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.date.lte = filters.dateTo;
      }
    }

    const [attendances, total] = await Promise.all([
      prisma.dailyAttendance.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true
            }
          },
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              section: true
            }
          },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: [
          { date: 'desc' },
          { student: { lastName: 'asc' } },
          { student: { firstName: 'asc' } }
        ],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit
      }),
      prisma.dailyAttendance.count({ where })
    ]);

    return {
      attendances,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit)
      }
    };
  }

  // Actualizar registro de asistencia
  async update(prisma: PrismaClient, id: string, data: UpdateAttendanceInput, userId: string): Promise<DailyAttendance> {
    const existingAttendance = await prisma.dailyAttendance.findUnique({
      where: { id },
      include: {
        classroom: {
          select: { instituteId: true }
        }
      }
    });

    if (!existingAttendance) {
      throw new NotFoundError('Registro de asistencia', id);
    }

    // Verificar permisos
    await this.checkAttendanceAccess(prisma, existingAttendance.classroom.instituteId!, userId, true);

    const attendance = await prisma.dailyAttendance.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.comments !== undefined && { comments: data.comments }),
        teacherId: userId // Actualizar el profesor que modificó
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true
          }
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true
          }
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Limpiar caches
    await this.clearAttendanceCaches(
      existingAttendance.classroom.instituteId!,
      existingAttendance.classroomId,
      existingAttendance.studentId
    );

    return attendance;
  }

  // Eliminar registro de asistencia
  async delete(prisma: PrismaClient, id: string, userId: string): Promise<{ message: string }> {
    const attendance = await prisma.dailyAttendance.findUnique({
      where: { id },
      include: {
        classroom: {
          select: { instituteId: true }
        },
        student: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    if (!attendance) {
      throw new NotFoundError('Registro de asistencia', id);
    }

    // Verificar permisos (solo admin y coordinator pueden eliminar)

    await prisma.dailyAttendance.delete({
      where: { id }
    });

    // Limpiar caches
    await this.clearAttendanceCaches(
      attendance.classroom.instituteId!,
      attendance.classroomId,
      attendance.studentId
    );

    return {
      message: `Registro de asistencia de ${attendance.student.firstName} ${attendance.student.lastName} eliminado correctamente`
    };
  }

  // Obtener asistencia por aula y fecha
  async getByClassroomAndDate(prisma: PrismaClient, classroomId: string, date: Date, userId: string) {
    // Verificar que el aula existe
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, instituteId: true, isActive: true, name: true, grade: true, section: true }
    });

    if (!classroom || !classroom.isActive) {
      throw new NotFoundError('Aula', classroomId);
    }

    // Verificar permisos
    await this.checkAttendanceAccess(prisma, classroom.instituteId!, userId);

    const cacheKey = `attendance:classroom:${classroomId}:date:${date.toISOString().split('T')[0]}`;
    const cached = await RedisCache.get<any>(cacheKey);

    if (cached) {
      return cached;
    }

    // Obtener todos los estudiantes del aula
    const studentClassrooms = await prisma.studentClassroom.findMany({
      where: {
        classroomId,
        isActive: true
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true
          }
        }
      },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } }
      ]
    });
    const students = studentClassrooms.map(sc => sc.student).filter(Boolean);

    // Obtener registros de asistencia existentes
    const DailyAttendances = await prisma.dailyAttendance.findMany({
      where: {
        classroomId,
        date
      },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Mapear estudiantes con su asistencia
    const attendanceMap = new Map(DailyAttendances.map(record => [record.studentId, record]));

    const result = {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        grade: classroom.grade,
        section: classroom.section
      },
      date,
      students: students.map(student => ({
        ...student,
        attendance: attendanceMap.get(student.id) || null
      })),
      summary: {
        total: students.length,
        present: DailyAttendances.filter(r => r.status === AttendanceStatus.PRESENT).length,
        absent: DailyAttendances.filter(r => r.status === AttendanceStatus.ABSENT).length,
        late: DailyAttendances.filter(r => r.status === AttendanceStatus.LATE).length,
        justified: 0,
        pending: students.length - DailyAttendances.length
      }
    };

    // Cachear por 30 minutos
    await RedisCache.set(cacheKey, result, 1800);

    return result;
  }

  // Obtener estadísticas de asistencia por estudiante
  async getStudentStats(prisma: PrismaClient, studentId: string, dateFrom?: Date, dateTo?: Date, userId?: string) {
    // Verificar que el estudiante existe
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentCode: true,
        instituteId: true,
        role: true,
        isActive: true
      }
    });

    if (!student || !student.isActive || student.role !== UserRole.STUDENT) {
      throw new NotFoundError('Estudiante', studentId);
    }

    // Verificar permisos si se proporciona userId
    if (userId) {
      await this.checkAttendanceAccess(prisma, student.instituteId!, userId);
    }

    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;

    const cacheKey = `attendance:stats:student:${studentId}:${dateFrom?.toISOString() || 'all'}:${dateTo?.toISOString() || 'all'}`;
    const cached = await RedisCache.get<any>(cacheKey);

    if (cached) {
      return cached;
    }

    const DailyAttendances = await prisma.dailyAttendance.findMany({
      where: {
        studentId,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
      },
      select: {
        status: true,
        date: true
      }
    });

    const stats = {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentCode: student.studentCode
      },
      period: {
        from: dateFrom,
        to: dateTo
      },
      total: DailyAttendances.length,
      present: DailyAttendances.filter(r => r.status === AttendanceStatus.PRESENT).length,
      absent: DailyAttendances.filter(r => r.status === AttendanceStatus.ABSENT).length,
      late: DailyAttendances.filter(r => r.status === AttendanceStatus.LATE).length,
      justified: 0,
      attendanceRate: DailyAttendances.length > 0
        ? (DailyAttendances.filter(r => (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE)).length / DailyAttendances.length * 100).toFixed(2)
        : '0.00'
    };

    // Cachear por 15 minutos
    await RedisCache.set(cacheKey, stats, 900);

    return stats;
  }

  // Obtener estadísticas de asistencia por aula
  async getClassroomStats(prisma: PrismaClient, classroomId: string, dateFrom?: Date, dateTo?: Date, userId?: string) {
    // Verificar que el aula existe
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        name: true,
        grade: true,
        section: true,
        instituteId: true,
        isActive: true
      }
    });

    if (!classroom || !classroom.isActive) {
      throw new NotFoundError('Aula', classroomId);
    }

    // Verificar permisos si se proporciona userId
    if (userId) {
      await this.checkAttendanceAccess(prisma, classroom.instituteId!, userId);
    }

    const dateFilter: any = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;

    const cacheKey = `attendance:stats:classroom:${classroomId}:${dateFrom?.toISOString() || 'all'}:${dateTo?.toISOString() || 'all'}`;
    const cached = await RedisCache.get<any>(cacheKey);

    if (cached) {
      return cached;
    }

    const [DailyAttendances, totalStudents] = await Promise.all([
      prisma.dailyAttendance.findMany({
        where: {
          classroomId,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
        },
        select: {
          status: true,
          date: true,
          studentId: true
        }
      }),
      prisma.studentClassroom.count({
        where: {
          classroomId,
          isActive: true
        }
      })
    ]);

    // Agrupar por fecha
    const recordsByDate = DailyAttendances.reduce((acc, record) => {
      const dateKey = record.date.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(record);
      return acc;
    }, {} as Record<string, typeof DailyAttendances>);

    const stats = {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        grade: classroom.grade,
        section: classroom.section
      },
      period: {
        from: dateFrom,
        to: dateTo
      },
      totalStudents,
      totalRecords: DailyAttendances.length,
      present: DailyAttendances.filter(r => r.status === AttendanceStatus.PRESENT).length,
      absent: DailyAttendances.filter(r => r.status === AttendanceStatus.ABSENT).length,
      late: DailyAttendances.filter(r => r.status === AttendanceStatus.LATE).length,
      justified: 0,
      averageAttendanceRate: Object.keys(recordsByDate).length > 0
        ? (Object.values(recordsByDate).reduce((sum, dayRecords) => {
          const attendedCount = dayRecords.filter(r => (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE)).length;
          return sum + (attendedCount / totalStudents * 100);
        }, 0) / Object.keys(recordsByDate).length).toFixed(2)
        : '0.00',
      daysWithRecords: Object.keys(recordsByDate).length
    };

    // Cachear por 15 minutos
    await RedisCache.set(cacheKey, stats, 900);

    return stats;
  }

  // Métodos auxiliares privados
  private async checkAttendanceAccess(prisma: PrismaClient, instituteId: string, userId: string, requireWrite = false): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, instituteId: true }
    });

    if (!user) {
      throw new NotFoundError('Usuario', userId);
    }

    // Admin puede acceder a todo
    if (user.role === UserRole.ADMIN) {
      return;
    }

    // Profesor puede acceder a su instituto
    if (user.role === UserRole.TEACHER && user.instituteId === instituteId) {
      return;
    }

    throw new AuthorizationError(
      requireWrite
        ? 'No tienes permisos para modificar registros de asistencia'
        : 'No tienes permisos para acceder a esta información'
    );
  }

  private async clearAttendanceCaches(instituteId: string, classroomId?: string, studentId?: string): Promise<void> {
    const patterns = [
      classroomId ? `attendance:classroom:${classroomId}:*` : undefined,
      classroomId ? `attendance:stats:classroom:${classroomId}:*` : undefined,
      studentId ? `attendance:stats:student:${studentId}:*` : undefined,
    ].filter(Boolean) as string[];

    for (const pattern of patterns) {
      await RedisCache.clearPattern(pattern);
    }
  }
}
