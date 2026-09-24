import { UserRole, AttendanceStatus, ActionType } from '../utils/prisma-enums';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateAttendanceInput, UpdateAttendanceInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';
import { RequestUser } from '../types/fastify';
import { assertClassroomScope, canSeeStudent, teacherClassroomIds } from '../services/authorization.service';
import { AppErrors } from '../middleware/error.middleware';

/**
 * LA ASISTENCIA ES DE LA SECCIÓN, Y LA SECCIÓN DE QUIEN LA LLEVA
 *
 * Leer por id, corregir, borrar o pasar la lista de golpe solo pedían «ser
 * profesor»: el profesor de 1.º B corregía o borraba la asistencia de 1.º A, y
 * cualquiera con sesión —alumnos y representantes incluidos— leía la de una
 * sección entera por su fecha (`quien-puede-que.test.ts`).
 */
async function puedeTocarLaAsistencia(request: FastifyRequest, classroomId: string) {
  await assertClassroomScope(request.tenantPrisma, request.user as any, classroomId, {
    accion: 'pasar asistencia',
  });
}

/** Los alumnos tienen que estar inscritos en ESA sección: no se pasa lista a los de otra. */
async function soloAlumnosDeLaSeccion(request: FastifyRequest, classroomId: string, studentIds: string[]) {
  const unicos = Array.from(new Set(studentIds.filter(Boolean)));
  if (unicos.length === 0) return;
  const inscritos = await request.tenantPrisma.studentClassroom.count({
    where: { classroomId, isActive: true, studentId: { in: unicos } },
  });
  if (inscritos !== unicos.length) {
    throw AppErrors.Forbidden('Solo se pasa asistencia a los alumnos de esa sección');
  }
}
import { instituteTimezone, isFutureDate, todayInTimezone } from '../utils/school-time';
import { fueModificadoPorOtro, versionVista, AVISO_MODIFICADO_POR_OTRO } from '../utils/concurrencia';
import { borrarGuardandoCopia, quienBorra } from '../utils/papelera';

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

    // La fecha la valida el SERVIDOR: si el reloj del dispositivo va adelantado
    // (a mano o por una VPN), no se puede registrar asistencia de un día que aún
    // no ha ocurrido.
    const zonaLiceo = await instituteTimezone(request.tenantPrisma);
    if (isFutureDate(attendanceData.date, zonaLiceo)) {
      return reply.status(400).send({
        error: 'No se puede registrar asistencia de una fecha futura',
        code: 'FUTURE_DATE',
        today: todayInTimezone(zonaLiceo),
      });
    }

    // Un profesor solo pasa asistencia en las clases que imparte (o en su
    // sección guía). Antes cualquier profesor podía hacerlo en cualquier sección.
    await puedeTocarLaAsistencia(request, attendanceData.classroomId);

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

    await soloAlumnosDeLaSeccion(request, attendanceData.classroomId, [attendanceData.studentId]);

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
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
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

    // Quién pide decide qué se ve. El administrador, todo; el profesor, las
    // secciones que lleva; el alumno y el representante, solo lo suyo.
    const actor = request.user as any;
    const actorId = actor?.userId ?? actor?.id;
    if (actor?.role !== UserRole.ADMIN) {
      if (classroomId) {
        await puedeTocarLaAsistencia(request, classroomId);
      } else if (actor?.role === UserRole.TEACHER) {
        where.classroomId = { in: await teacherClassroomIds(request.tenantPrisma, actorId) };
      }
      if (actor?.role === UserRole.STUDENT) {
        where.studentId = actorId;
      } else if (actor?.role === UserRole.TUTOR) {
        const suyos = await request.tenantPrisma.studentTutor.findMany({
          where: { tutorId: actorId },
          select: { studentId: true },
        });
        where.studentId = { in: suyos.map((x) => x.studentId) };
      }
      if (studentId && !(await canSeeStudent(request.tenantPrisma, actor, studentId))) {
        throw AppErrors.Forbidden('Solo puedes consultar a tus estudiantes');
      }
    }

    if (studentId) {
      // Ya comprobado arriba con `canSeeStudent` para quien no es administrador.
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
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
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

    // Verificar permisos según el rol: el profesor, si lleva esa sección; el
    // alumno y su representante, si es suyo. Antes solo se miraba al alumno.
    const user = request.user as RequestUser;
    const puedeVerlo =
      user?.role === UserRole.ADMIN ||
      (user?.role === UserRole.TEACHER
        ? await puedeTocarLaAsistencia(request, attendance.classroomId).then(() => true, () => false)
        : await canSeeStudent(request.tenantPrisma, user as any, attendance.studentId));
    if (!puedeVerlo) {
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
    // `any`: el cuerpo admite más campos de los que declara el tipo de la ruta;
    // abajo se filtra a los que existen en la tabla.
    const updateData = request.body as any;
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

    await puedeTocarLaAsistencia(request, existingAttendance.classroomId);

    // DOS PERSONAS, LA MISMA ASISTENCIA
    //
    // Mismo caso que con las notas: si la pantalla mandó la versión que tenía a
    // la vista y ya cambió, otra persona guardó primero. Se avisa en vez de
    // borrarle el cambio sin que se entere. Quien no manda versión guarda igual.
    if (fueModificadoPorOtro(versionVista(request as any), existingAttendance.updatedAt)) {
      return reply.status(409).send({
        ...AVISO_MODIFICADO_POR_OTRO,
        actual: { status: existingAttendance.status, updatedAt: existingAttendance.updatedAt },
      });
    }

    // Actualizar el registro de asistencia
    const attendance = await request.tenantPrisma.dailyAttendance.update({
      where: { id },
      // Solo los campos que existen: antes se volcaba el cuerpo entero y
      // cualquier campo inesperado hacía fallar la petición con un 500.
      data: {
        ...(updateData.status !== undefined ? { status: updateData.status } : {}),
        ...(updateData.comments !== undefined ? { comments: updateData.comments } : {}),
        ...(updateData.excuseNote !== undefined ? { excuseNote: updateData.excuseNote } : {}),
        ...(updateData.lateArrival !== undefined ? { lateArrival: updateData.lateArrival } : {}),
        ...(updateData.earlyLeave !== undefined ? { earlyLeave: updateData.earlyLeave } : {}),
        ...(updateData.periods !== undefined ? { periods: updateData.periods } : {}),
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
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
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

    await puedeTocarLaAsistencia(request, existingAttendance.classroomId);

    // Eliminar el registro de asistencia (con copia en la papelera)
    await borrarGuardandoCopia(
      request.tenantPrisma,
      'dailyAttendance',
      { id },
      quienBorra(request as any)
    );

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
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No autorizado',
        code: (error as any).code || 'FORBIDDEN',
      });
    }
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

    /**
     * QUIÉN PUEDE VER LA ASISTENCIA DE ESTE ALUMNO
     *
     * Antes aquí solo se frenaba al propio alumno mirando la de otro. Al
     * representante no se le preguntaba nada: con el identificador de cualquier
     * alumno del liceo leía su asistencia completa, aunque no lo representara.
     * Y la regla del liceo es clara: **el tutor solo ve a los alumnos que
     * tutela**.
     *
     * `canSeeStudent` es la misma pregunta que usa el resto del sistema: el
     * propio alumno, su representante, un profesor que le da clase o es su guía,
     * y el administrador. Lo cazó `puertas-sin-cerradura` (PUERTA-09).
     */
    const user = request.user as RequestUser;
    const puedeVerlo = await canSeeStudent(request.tenantPrisma, user as any, studentId);
    if (!puedeVerlo) {
      return reply.status(403).send({
        error: 'No puedes ver la asistencia de este estudiante',
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

    await puedeTocarLaAsistencia(request, classroomId);
    await soloAlumnosDeLaSeccion(request, classroomId, (attendances || []).map((a: any) => a.studentId));

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

    // Quiénes ya tenían asistencia ese día: solo para poder contar cuántas
    // se crean y cuántas se corrigen en el mensaje de vuelta.
    const yaTenian = new Set(
      (
        await request.tenantPrisma.dailyAttendance.findMany({
          where: { classroomId, date: attendanceDate },
          select: { studentId: true },
        })
      ).map((a) => a.studentId)
    );

    // DOS ENVÍOS A LA VEZ
    //
    // Antes se leía qué había y se escribía después. Un doble clic, o el
    // navegador reintentando por una red lenta, mandaba dos veces lo mismo:
    // las dos peticiones veían el aula vacía, las dos creaban las mismas
    // filas y la segunda chocaba contra la base. El profesor veía "Error en
    // el servidor" sin saber si la asistencia había quedado guardada.
    //
    // Con upsert sobre (alumno, fecha) el segundo envío corrige en lugar de
    // chocar: pulsar dos veces deja exactamente lo mismo que pulsar una.
    const operaciones = attendances.map((attendanceData) =>
      request.tenantPrisma.dailyAttendance.upsert({
        where: {
          studentId_date: {
            studentId: attendanceData.studentId,
            date: attendanceDate,
          },
        },
        update: {
          status: attendanceData.status,
          comments: attendanceData.comments,
          classroomId,
          updatedAt: new Date(),
        },
        create: {
          studentId: attendanceData.studentId,
          classroomId,
          status: attendanceData.status,
          comments: attendanceData.comments,
          date: attendanceDate,
          teacherId: user?.userId,
        },
      })
    );

    // Todo el pase de lista entra junto o no entra nada: si se corta la
    // conexión a mitad no queda media sección marcada.
    await request.tenantPrisma.$transaction(operaciones);

    const createOperations = attendances.filter((a) => !yaTenian.has(a.studentId));
    const updateOperations = attendances.filter((a) => yaTenian.has(a.studentId));

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

    // A quién le toca: a los alumnos de la lista y a sus representantes, y al
    // personal de la sección. Los demás alumnos del liceo ni se enteran.
    request.aQuienAfecta = {
      studentIds: attendances.map((a: { studentId: string }) => a.studentId),
      classroomId,
    };

    return reply.status(201).send({
      success: true,
      message: `Se registraron ${createOperations.length} asistencias nuevas y se actualizaron ${updateOperations.length} existentes`,
      created: createOperations.length,
      updated: updateOperations.length,
    });
  } catch (error) {
    // Los errores con código propio (permisos, no encontrado…) se responden
    // tal cual: convertirlos en 500 esconde el motivo real.
    if ((error as any)?.statusCode) {
      return reply.status((error as any).statusCode).send({
        error: (error as any).message || 'No se pudo registrar la asistencia',
        code: (error as any).code || 'ERROR',
      });
    }
    logger.error('Error al registrar asistencia masiva', {
      error: error instanceof Error ? error.message : String(error)
    });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}
