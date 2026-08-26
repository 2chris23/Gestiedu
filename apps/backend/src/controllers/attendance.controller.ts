import { UserRole, AttendanceStatus, ActionType } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateAttendanceInput, UpdateAttendanceInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';
import { RequestUser } from '../types/fastify';

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

interface MarkClassAttendanceBody {
  classroomId: string;
  subjectId: string;
  date: string;
  students: StudentAttendanceEntry[];
  attendances: StudentAttendanceEntry[];
}

interface AttendanceReportFilters {
  classroomId?: string;
  subjectId?: string;
  studentId?: string;
  startDate?: string;
  endDate?: string;
  periodId?: string;
}

interface CreateAttendanceRequest {
  Body: CreateAttendanceInput;
}

interface UpdateAttendanceRequest {
  Params: { id: string };
  Body: UpdateAttendanceInput;
}

interface GetAttendanceRequest {
  Params: { id: string };
}

interface GetAttendancesRequest {
  Querystring: AttendanceFilters & PaginationInput;
}

interface DeleteAttendanceRequest {
  Params: { id: string };
}

interface MarkClassAttendanceRequest {
  Body: MarkClassAttendanceBody;
}

interface AttendanceReportRequest {
  Querystring: AttendanceReportFilters;
}

interface StudentAttendanceRequest {
  Params: { studentId: string };
  Querystring: {
    startDate?: string;
    endDate?: string;
    subjectId?: string;
  };
}

/**
 * Controlador para crear un registro de asistencia
 */
export async function createAttendance(
  request: FastifyRequest<CreateAttendanceRequest>,
  reply: FastifyReply
) {
  try {
    const attendanceData = request.body;
    // Para instituto único
    const instituteId = 'institute';

    // Verificar que el estudiante existe
    const student = await request.tenantPrisma.user.findFirst({
      where: {
        id: attendanceData.studentId,
        role: UserRole.STUDENT,
      },
    });

    if (!student) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Verificar que la materia existe
    const subject = await request.tenantPrisma.subject.findFirst({
      where: {
        id: attendanceData.subjectId
      },
    });

    if (!subject) {
      return reply.status(404).send({
        error: 'Materia no encontrada',
        code: 'SUBJECT_NOT_FOUND',
      });
    }

    // Verificar que el aula existe
    const classroom = await request.tenantPrisma.classroom.findFirst({
      where: {
        id: attendanceData.classroomId
      },
    });

    if (!classroom) {
      return reply.status(404).send({
        error: 'Aula no encontrada',
        code: 'CLASSROOM_NOT_FOUND',
      });
    }

    // Verificar si ya existe un registro de asistencia para la misma fecha
    const existingAttendance = await request.tenantPrisma.dailyAttendance.findFirst({
      where: {
        studentId: attendanceData.studentId,
        classroomId: attendanceData.classroomId,
        date: new Date(attendanceData.date),
      },
    });

    if (existingAttendance) {
      return reply.status(409).send({
        error: 'Ya existe un registro de asistencia para esta fecha',
        code: 'ATTENDANCE_EXISTS',
      });
    }

    // Crear el registro de asistencia
    const attendance = await request.tenantPrisma.dailyAttendance.create({
      data: {
        studentId: attendanceData.studentId,
        classroomId: attendanceData.classroomId,
        status: attendanceData.status,
        comments: attendanceData.comments,
        date: new Date(attendanceData.date),
        teacherId: (request.user as RequestUser)?.userId,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
          },
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
          },
        },
      },
    });

    // Registrar el evento de creación
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.CREATE,
        entity: 'ATTENDANCE',
        entityType: 'ATTENDANCE',
        entityId: attendance.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          studentId: attendance.studentId,
          status: attendance.status,
          date: attendance.date.toISOString(),
        },
        userId: (request.user as RequestUser)?.userId,
      },
    });

    logger.info('Registro de asistencia creado', {
      attendanceId: attendance.id,
      studentId: attendance.studentId
    });

    return reply.status(201).send({ attendance });
  } catch (error) {
    logger.error('Error al crear registro de asistencia', {
      error: error instanceof Error ? error.message : String(error)
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener todos los registros de asistencia
 */
export async function getAttendances(
  request: FastifyRequest<GetAttendancesRequest>,
  reply: FastifyReply
) {
  try {
    const {
      page = 1,
      limit = 10,
      studentId,
      classroomId,
      subjectId,
      status,
      startDate,
      endDate,
    } = request.query;

    // Instituto único
    const instituteId = 'institute';

    const skip = (page - 1) * limit;

    // Construir filtros (instituto único)
    const where: any = {};

    if (studentId) {
      where.studentId = studentId;
    }

    if (classroomId) {
      where.classroomId = classroomId;
    }

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      where.date = {
        gte: new Date(startDate),
      };
    } else if (endDate) {
      where.date = {
        lte: new Date(endDate),
      };
    }

    // Obtener registros de asistencia y total
    const [attendances, total] = await Promise.all([
      request.tenantPrisma.dailyAttendance.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true,
            },
          },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              section: true,
            },
          },
        },
        orderBy: [
          { date: 'desc' },
          { student: { lastName: 'asc' } },
        ],
      }),
      request.tenantPrisma.dailyAttendance.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return reply.status(200).send({
      attendances,
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
    logger.error('Error al obtener registros de asistencia', {
      error: error instanceof Error ? error.message : String(error)
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener un registro de asistencia por ID
 */
export async function getAttendance(
  request: FastifyRequest<GetAttendanceRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    // Instituto único
    const instituteId = 'institute';

    const attendance = await request.tenantPrisma.dailyAttendance.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            email: true,
          },
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
          },
        },
      },
    });

    if (!attendance) {
      return reply.status(404).send({
        error: 'Registro de asistencia no encontrado',
        code: 'ATTENDANCE_NOT_FOUND',
      });
    }

    // Verificar permisos según el rol
    const user = request.user as RequestUser;
    if (user?.role === UserRole.STUDENT && attendance.studentId !== user.userId) {
      return reply.status(403).send({
        error: 'No tienes permiso para ver este registro de asistencia',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    return reply.status(200).send({ attendance });
  } catch (error) {
    logger.error('Error al obtener registro de asistencia', {
      error: error instanceof Error ? error.message : String(error),
      attendanceId: request.params.id
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para actualizar un registro de asistencia
 */
export async function updateAttendance(
  request: FastifyRequest<UpdateAttendanceRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const updateData = request.body;
    // Instituto único
    const instituteId = 'institute';

    // Verificar que el registro de asistencia existe
    const existingAttendance = await request.tenantPrisma.dailyAttendance.findUnique({
      where: { id },
    });

    if (!existingAttendance) {
      return reply.status(404).send({
        error: 'Registro de asistencia no encontrado',
        code: 'ATTENDANCE_NOT_FOUND',
      });
    }

    // Actualizar el registro de asistencia
    const attendance = await request.tenantPrisma.dailyAttendance.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
          },
        },
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            section: true,
          },
        },
      },
    });

    // Registrar el evento de actualización
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'ATTENDANCE',
        entityType: 'ATTENDANCE',
        entityId: attendance.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          changes: updateData as any,
        },
        userId: (request.user as RequestUser)?.userId,
      },
    });

    logger.info('Asistencia actualizada', {
      attendanceId: attendance.id,
      studentId: attendance.studentId
    });

    return reply.status(200).send({ attendance });
  } catch (error) {
    logger.error('Error al actualizar asistencia', {
      error: error instanceof Error ? error.message : String(error),
      attendanceId: request.params.id
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para eliminar un registro de asistencia
 */
export async function deleteAttendance(
  request: FastifyRequest<DeleteAttendanceRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    // Solo administradores y profesores pueden eliminar registros de asistencia
    const user = request.user as RequestUser;
    if (user?.role !== UserRole.ADMIN && user?.role !== UserRole.TEACHER) {
      return reply.status(403).send({
        error: 'No tienes permisos para eliminar registros de asistencia',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Verificar que el registro existe
    const existingAttendance = await request.tenantPrisma.dailyAttendance.findUnique({
      where: { id },
    });

    if (!existingAttendance) {
      return reply.status(404).send({
        error: 'Registro de asistencia no encontrado',
        code: 'ATTENDANCE_NOT_FOUND',
      });
    }

    // Eliminar el registro de asistencia
    await request.tenantPrisma.dailyAttendance.delete({
      where: { id },
    });

    // Registrar el evento de eliminación
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.DELETE,
        entity: 'ATTENDANCE',
        entityType: 'ATTENDANCE',
        entityId: id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          deletedStudentId: existingAttendance.studentId,
          deletedDate: existingAttendance.date.toISOString(),
        },
        userId: user?.userId,
      },
    });

    logger.info('Asistencia eliminada', {
      attendanceId: id,
      studentId: existingAttendance.studentId
    });

    return reply.status(200).send({
      message: 'Registro de asistencia eliminado correctamente',
    });
  } catch (error) {
    logger.error('Error al eliminar asistencia', {
      error: error instanceof Error ? error.message : String(error),
      attendanceId: request.params.id
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener asistencias de un estudiante
 */
export async function getStudentAttendance(
  request: FastifyRequest<StudentAttendanceRequest>,
  reply: FastifyReply
) {
  try {
    const { studentId } = request.params;
    const { startDate, endDate, subjectId } = request.query;

    // Verificar que el estudiante existe
    const student = await request.tenantPrisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
      },
    });

    if (!student) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Verificar permisos según el rol
    const user = request.user as RequestUser;
    if (user?.role === UserRole.STUDENT && studentId !== user.userId) {
      return reply.status(403).send({
        error: 'Solo puedes ver tu propia asistencia',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Construir filtros
    const where: any = {
      studentId,
    };

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      where.date = {
        gte: new Date(startDate),
      };
    } else if (endDate) {
      where.date = {
        lte: new Date(endDate),
      };
    }

    // Obtener los registros de asistencia
    const attendances = await request.tenantPrisma.dailyAttendance.findMany({
      where,
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
          },
        },
      },
      orderBy: [
        { date: 'desc' },
      ],
    });

    // Calcular estadísticas
    const totalDays = attendances.length;
    const present = attendances.filter(a => a.status === AttendanceStatus.PRESENT).length;
    const absent = attendances.filter(a => a.status === AttendanceStatus.ABSENT).length;
    const late = attendances.filter(a => a.status === AttendanceStatus.LATE).length;
    const justified = attendances.filter(a => a.status === AttendanceStatus.EXCUSED).length;

    const presentPercentage = totalDays > 0 ? (present / totalDays) * 100 : 0;
    const absentPercentage = totalDays > 0 ? (absent / totalDays) * 100 : 0;

    return reply.status(200).send({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentCode: student.studentCode,
      },
      attendances,
      summary: {
        totalDays,
        present,
        absent,
        late,
        justified,
        presentPercentage: Math.round(presentPercentage * 100) / 100,
        absentPercentage: Math.round(absentPercentage * 100) / 100,
      },
    });
  } catch (error) {
    logger.error('Error al obtener asistencia de estudiante', {
      error: error instanceof Error ? error.message : String(error),
      studentId: request.params.studentId
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para marcar asistencia masiva de una clase
 */
export async function markClassAttendance(
  request: FastifyRequest<MarkClassAttendanceRequest>,
  reply: FastifyReply
) {
  try {
    const { classroomId, subjectId, date, attendances } = request.body;

    // Verificar que el aula existe
    const classroom = await request.tenantPrisma.classroom.findFirst({
      where: {
        id: classroomId
      },
    });

    if (!classroom) {
      return reply.status(404).send({
        error: 'Aula no encontrada',
        code: 'CLASSROOM_NOT_FOUND',
      });
    }

    // Verificar que la materia existe
    const subject = await request.tenantPrisma.subject.findFirst({
      where: {
        id: subjectId
      },
    });

    if (!subject) {
      return reply.status(404).send({
        error: 'Materia no encontrada',
        code: 'SUBJECT_NOT_FOUND',
      });
    }

    const attendanceDate = new Date(date);
    const user = request.user as RequestUser;

    // Obtener registros de asistencia existentes para esta fecha y aula
    const existingAttendances = await request.tenantPrisma.dailyAttendance.findMany({
      where: {
        classroomId,
        date: attendanceDate,
      },
    });

    const existingMap = new Map(
      existingAttendances.map(attendance => [attendance.studentId, attendance.id])
    );

    // Preparar operaciones de creación y actualización
    const createOperations = [];
    const updateOperations = [];

    for (const attendanceData of attendances) {
      const existingId = existingMap.get(attendanceData.studentId);

      if (existingId) {
        // Actualizar asistencia existente
        updateOperations.push(
          request.tenantPrisma.dailyAttendance.update({
            where: { id: existingId },
            data: {
              status: attendanceData.status,
              comments: attendanceData.comments,
              updatedAt: new Date(),
            },
          })
        );
      } else {
        // Crear nueva asistencia
        createOperations.push(
          request.tenantPrisma.dailyAttendance.create({
            data: {
              studentId: attendanceData.studentId,
              classroomId,
              status: attendanceData.status,
              comments: attendanceData.comments,
              date: attendanceDate,
              teacherId: user?.userId,
            },
          })
        );
      }
    }

    // Ejecutar operaciones en transacción
    await request.tenantPrisma.$transaction([
      ...createOperations,
      ...updateOperations,
    ]);

    // Registrar el evento
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.BULK_CREATE,
        entity: 'ATTENDANCE',
        entityType: 'ATTENDANCE',
        entityId: classroomId,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          classroomId,
          subjectId,
          date: attendanceDate.toISOString(),
          created: createOperations.length,
          updated: updateOperations.length,
        },
        userId: user?.userId,
      },
    });

    logger.info('Asistencia masiva registrada', {
      classroomId,
      subjectId,
      date: attendanceDate.toISOString(),
      created: createOperations.length,
      updated: updateOperations.length,
    });

    return reply.status(201).send({
      success: true,
      message: `Se registraron ${createOperations.length} asistencias nuevas y se actualizaron ${updateOperations.length} existentes`,
      created: createOperations.length,
      updated: updateOperations.length,
    });
  } catch (error) {
    logger.error('Error al registrar asistencia masiva', {
      error: error instanceof Error ? error.message : String(error)
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
