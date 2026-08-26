import { UserRole, ActionType } from '../utils/prisma-enums';
import * as crypto from 'crypto';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateUserInput, UpdateUserInput, UserFiltersInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';
import { createAuditLogger } from '../services/audit.service'; // ✅ SECURITY: Audit logging
import { gradesService } from '../services/grades.service'; // promedio ponderado unificado (Fase 2.5)
import { studentsWithNoteInSubject } from '../services/aggregation.service'; // filtro por lapso (Fase 3.5)

interface CreateStudentRequest {
  Body: CreateUserInput;
}

interface UpdateStudentRequest {
  Params: { id: string };
  Body: UpdateUserInput;
}

interface GetStudentRequest {
  Params: { id: string };
}

interface GetStudentsRequest {
  Querystring: UserFiltersInput & PaginationInput & { periodId?: string };
}

interface DeleteStudentRequest {
  Params: { id: string };
}

/**
 * Controlador para crear un nuevo estudiante
 */
export async function createStudent(
  request: FastifyRequest<CreateStudentRequest>,
  reply: FastifyReply
) {
  try {
    const studentData = { ...request.body, role: UserRole.STUDENT } as any;

    // Fix for Date format mismatch (Schema 'date' vs Prisma DateTime)
    if (studentData.birthDate && !studentData.birthDate.includes('T')) {
      studentData.birthDate = new Date(studentData.birthDate).toISOString();
    }

    // Verificar si el estudiante ya existe
    let existingStudent = null;
    if (studentData.id) {
      existingStudent = await request.tenantPrisma.user.findUnique({
        where: { id: studentData.id },
      });
    }

    if (!existingStudent && studentData.email) {
      existingStudent = await request.tenantPrisma.user.findUnique({
        where: { email: studentData.email }
      });
    }

    if (existingStudent) {
      return reply.status(409).send({
        error: 'El estudiante ya existe',
        code: 'STUDENT_EXISTS',
      });
    }

    // Verificar si el aula existe (si se proporciona)
    const classroomId = (request.body as any)?.classroomId as string | undefined;
    if (classroomId) {
      const classroom = await request.tenantPrisma.classroom.findUnique({
        where: { id: classroomId },
      });

      if (!classroom) {
        return reply.status(404).send({
          error: 'Aula no encontrada',
          code: 'CLASSROOM_NOT_FOUND',
        });
      }
    }

    // Crear el estudiante
    const student = await request.tenantPrisma.user.create({
      data: {
        id: studentData.id || crypto.randomUUID(),
        ...(studentData as any),

      },
      include: {
        classroom: true,
        institute: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Registrar el evento de creación
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.CREATE,
        entity: 'STUDENT',
        entityType: 'STUDENT',
        entityId: student.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Nuevo estudiante creado', { studentId: student.id });

    return reply.status(201).send({
      student: {
        ...student,
        password: undefined, // No devolver la contraseña
      },
    });
  } catch (error) {
    logger.error('Error al crear estudiante', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener todos los estudiantes (OPTIMIZADO)
 */
export async function getStudents(
  request: FastifyRequest<GetStudentsRequest>,
  reply: FastifyReply
) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      classroomId,
      isActive = true,
    } = request.query;


    const skip = (page - 1) * limit;

    // Construir filtros
    const where: any = {
      role: UserRole.STUDENT,
      isActive,
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { studentCode: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (classroomId) {
      where.classroomId = classroomId;
    }

    // OPTIMIZACIÓN: Obtener solo los campos necesarios sin includes pesados
    const [students, total] = await Promise.all([
      request.tenantPrisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          studentCode: true,
          isActive: true,
          classroomId: true,
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
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
      }),
      request.tenantPrisma.user.count({ where }),
    ]);

    // DEBUG: Log de resultados
    console.log('📊 getStudents results:', { total, studentsFound: students.length, where: JSON.stringify(where) });

    // OPTIMIZACIÓN: Calcular estadísticas con query agregada en lugar de traer todos los datos
    const studentIds = students.map(s => s.id);

    // ============================================================
    // ASISTENCIA — query dedicada sobre daily_attendance (sin JOIN a grades).
    // CORRECCIÓN: antes el % se calculaba en la misma query que AVG(score) con el
    // LEFT JOIN a grades; en estudiantes sin notas la fila se multiplicaba y el
    // COUNT(a.id) quedaba adulterado. Ahora el cálculo de asistencia es exacto:
    // (PRESENT + LATE) / total de registros de asistencia del estudiante.
    // ============================================================
    const attendanceQuery = `
      SELECT
        u.id as "studentId",
        CAST(COALESCE(
          (COUNT(CASE WHEN a.status IN ('PRESENT', 'LATE') THEN 1 END) * 100.0) /
          NULLIF(COUNT(a.id), 0),
          0
        ) AS FLOAT) as "attendancePercentage"
      FROM users u
      LEFT JOIN daily_attendance a ON a."studentId" = u.id
      WHERE u.id IN (${studentIds.map((_, i) => `$${i + 1}`).join(',')})
      GROUP BY u.id
    `;

    const attendanceStats = studentIds.length > 0
      ? await request.tenantPrisma.$queryRawUnsafe<Array<{
        studentId: string;
        attendancePercentage: number;
      }>>(attendanceQuery, ...studentIds)
      : [];

    // ============================================================
    // PROMEDIO — cálculo on-demand con la función unificada de la Fase 2.5
    // (promedio ponderado por criterio del plan de evaluación, que además
    // incluye las notas de ClassActivity.scores de Clase en Vivo).
    // CORRECCIÓN: antes se hacía AVG(score) SOLO sobre la tabla grades, por lo
    // que las calificaciones de Clase en Vivo (ClassActivity.scores en JSON)
    // nunca aparecían y el columna Promedio salía "Sin calificar" aunque
    // el estudiante tuviera notas reales.
    // Decisión: calcularSIEMPRE on-demand (sin campo cacheado) — el volumen
    // por aula (~20-30 estudiantes) hace viable el cálculo por materia.
    // ============================================================
    const subjectIdsByStudent = new Map<string, Set<string>>();
    if (studentIds.length > 0) {
      // Materias con grades por estudiante
      const gradeSubjects = await request.tenantPrisma.grade.groupBy({
        by: ['studentId', 'subjectId'],
        where: { studentId: { in: studentIds } },
      });
      gradeSubjects.forEach(g => {
        if (!subjectIdsByStudent.has(g.studentId)) subjectIdsByStudent.set(g.studentId, new Set());
        subjectIdsByStudent.get(g.studentId)!.add(g.subjectId);
      });

      // Materias con ClassActivity scoreadas (JSON scores) por estudiante
      const classActs = await request.tenantPrisma.classActivity.findMany({
        where: { classroomId, scores: { not: undefined } },
        select: { subjectId: true, scores: true },
      });
      classActs.forEach(ca => {
        let parsed: Record<string, number | null> = {};
        try { parsed = typeof ca.scores === 'string' ? JSON.parse(ca.scores) : (ca.scores || {}); } catch { return; }
        Object.keys(parsed).forEach(sid => {
          if (studentIds.includes(sid)) {
            if (!subjectIdsByStudent.has(sid)) subjectIdsByStudent.set(sid, new Set());
            subjectIdsByStudent.get(sid)!.add(ca.subjectId);
          }
        });
      });
    }

    const averages = new Map<string, number>();
    for (const sid of studentIds) {
      const subjects = subjectIdsByStudent.get(sid);
      if (!subjects || subjects.size === 0) {
        averages.set(sid, 0);
        continue;
      }
      const perSubject: number[] = [];
      for (const subjectId of subjects) {
        const avg = await gradesService.calculateWeightedSubjectAverage(
          request.tenantPrisma as any,
          sid,
          subjectId,
          request.query?.periodId || undefined // Filtro por lapso/momento
        );
        perSubject.push(avg);
      }
      // Promedio del estudiante = promedio simple de sus promedios por materia
      const avg = perSubject.length > 0
        ? perSubject.reduce((a, b) => a + b, 0) / perSubject.length
        : 0;
      averages.set(sid, Math.round(avg * 10) / 10);
    }

    const attendanceMap = new Map(
      attendanceStats.map(s => [s.studentId, Math.round(Number(s.attendancePercentage || 0))])
    );

    // Combinar datos de estudiantes con estadísticas
    const studentsWithStats = students.map(student => {
      const average = averages.get(student.id) || 0;
      const attendancePercentage = attendanceMap.get(student.id) || 0;

      return {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        avatar: student.avatar,
        studentCode: student.studentCode,
        isActive: student.isActive,
        classroom: student.classroom,
        average,
        attendancePercentage,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return reply.status(200).send({
      students: studentsWithStats,
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
    logger.error('Error al obtener estudiantes', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}


/**
 * Controlador para obtener un estudiante por ID
 */
export async function getStudent(
  request: FastifyRequest<GetStudentRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    const student = await request.tenantPrisma.user.findUnique({
      where: {
        id,
      },
      include: {
        classroom: {
          include: {
            teacher: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        institute: {
          select: {
            id: true,
            name: true,
          },
        },
        grades: {
          include: {
            subject: {
              select: {
                id: true,
                name: true,
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
          orderBy: {
            createdAt: 'desc',
          },
        },
        // Para simplificar, omitimos asistencia aquí; puede incluirse luego si es necesario
      },
    });

    if (!student || student.role !== UserRole.STUDENT) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    return reply.status(200).send({
      student: {
        ...student,
        password: undefined, // No devolver la contraseña
      },
    });
  } catch (error) {
    logger.error('Error al obtener estudiante', { error, studentId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para actualizar un estudiante
 */
export async function updateStudent(
  request: FastifyRequest<UpdateStudentRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const updateData = request.body;

    // Verificar que el estudiante existe
    const existingStudent = await request.tenantPrisma.user.findUnique({
      where: { id },
    });

    if (!existingStudent || existingStudent.role !== UserRole.STUDENT) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Verificar si el aula existe (si se proporciona)
    const classroomId = (updateData as any)?.classroomId as string | undefined;
    if (classroomId) {
      const classroom = await request.tenantPrisma.classroom.findUnique({
        where: { id: classroomId },
      });

      if (!classroom) {
        return reply.status(404).send({
          error: 'Aula no encontrada',
          code: 'CLASSROOM_NOT_FOUND',
        });
      }
    }

    // Actualizar el estudiante
    const student = await request.tenantPrisma.user.update({
      where: { id },
      data: {
        ...(updateData as any),
      },
      include: {
        classroom: true,
        institute: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Registrar el evento de actualización
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'STUDENT',
        entityType: 'STUDENT',
        entityId: student.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Estudiante actualizado', { studentId: student.id });

    return reply.status(200).send({
      student: {
        ...student,
        password: undefined, // No devolver la contraseña
      },
    });
  } catch (error) {
    logger.error('Error al actualizar estudiante', { error, studentId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para eliminar (desactivar) un estudiante
 */
export async function deleteStudent(
  request: FastifyRequest<DeleteStudentRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    // Verificar que el estudiante existe
    const existingStudent = await request.tenantPrisma.user.findUnique({
      where: { id },
    });

    if (!existingStudent || existingStudent.role !== UserRole.STUDENT) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Desactivar el estudiante en lugar de eliminarlo
    const student = await request.tenantPrisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // ✅ SECURITY: Enhanced audit logging with detailed information
    const auditLogger = createAuditLogger(request.tenantPrisma);
    await auditLogger.logDeleteStudent(
      request.user?.id || 'system',
      student.id,
      `${student.firstName} ${student.lastName}`,
      'Desactivado por administrador',
      request.ip,
      request.headers['user-agent']
    );

    logger.info('Estudiante desactivado', {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      deletedBy: request.user?.id
    });

    return reply.status(200).send({
      message: 'Estudiante eliminado correctamente',
    });
  } catch (error) {
    logger.error('Error al eliminar estudiante', { error, studentId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para reactivar un estudiante
 */
export async function reactivateStudent(
  request: FastifyRequest<DeleteStudentRequest>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;

    // Verificar que el estudiante existe
    const existingStudent = await request.tenantPrisma.user.findUnique({
      where: { id },
    });

    if (!existingStudent || existingStudent.role !== UserRole.STUDENT) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // Reactivar el estudiante
    const student = await request.tenantPrisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    // Registrar el evento de reactivación
    await request.tenantPrisma.auditLog.create({
      data: {
        action: ActionType.REACTIVATE,
        entity: 'STUDENT',
        entityType: 'STUDENT',
        entityId: student.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        userId: (request.user as any)?.id,
      },
    });

    logger.info('Estudiante reactivado', { studentId: student.id });

    return reply.status(200).send({
      message: 'Estudiante reactivado correctamente',
      student: {
        ...student,
        password: undefined, // No devolver la contraseña
      },
    });
  } catch (error) {
    logger.error('Error al reactivar estudiante', { error, studentId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Controlador para obtener estadísticas del dashboard de estudiante
 */
export async function getDashboardStats(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const prisma = request.tenantPrisma;

    // Ejecutar consultas en paralelo para optimizar
    const [student, totalObservations] = await Promise.all([
      prisma.user.findUnique({
        where: { id, role: UserRole.STUDENT },
        include: {
          classroom: {
            include: {
              teacher: {
                select: { firstName: true, lastName: true }
              }
            }
          },
          enrollments: {
            where: { status: 'ACTIVE' }, // Solo materias activas para promedio actual
            include: {
              subject: { select: { id: true, name: true, color: true } }
            }
          },
          attendance: true,
          // @ts-ignore - Propiedad recién agregada al schema
          academicHistory: {
            include: {
              academicYear: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
          },
          observations: {
            orderBy: { date: 'desc' },
            take: 3
          },
          // Fetch all grades for the student to calculate averages on the fly
          grades: {
            include: {
              subject: {
                select: { id: true, name: true, color: true }
              }
            }
          }
        }
      }),
      prisma.observation.count({ where: { studentId: id } })
    ]);

    if (!student) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    // --- KPIs: Promedio Global y Materias (JERARQUÍA — Nivel 2 por materia) ---
    // Las materias mostradas = las asignadas a la sección del estudiante +
    // las que tengan cualquier nota (grades table ∪ ClassActivity.scores — las
    // notas de Clase en Vivo cuentan). El promedio de cada materia es el Nivel 2
    // ponderado por criterios. Antes: media simple de grades y solo materias
    // con filas en la tabla grades (por eso "Sin materias inscritas" y 0).
    const classroomSubjects = student.classroom?.id
        ? await prisma.classroomSubject.findMany({
            where: { classroomId: student.classroom.id },
            include: { subject: { select: { id: true, name: true, color: true } } },
        })
        : [];
    const assignedMap = new Map<string, { id: string; name: string; color: string }>(
        classroomSubjects.map((cs: any) => [cs.subjectId, cs.subject])
    );

        const subjectIdsWithNote = new Set<string>();
        (student.grades || []).forEach((g: any) => {
            if (typeof g.score === 'number' && !Number.isNaN(g.score)) subjectIdsWithNote.add(g.subjectId);
        });
        if (student.classroom?.id) {
            const classActs = await prisma.classActivity.findMany({
                where: { classroomId: student.classroom.id, scores: { not: undefined } },
                select: { subjectId: true, scores: true },
            });
            classActs.forEach((ca: any) => {
                let parsed: Record<string, number | null> = {};
                try {
                    parsed = typeof ca.scores === 'string' ? JSON.parse(ca.scores) : (ca.scores || {});
                } catch { /* ignorar */ }
                if (parsed[id] !== null && parsed[id] !== undefined) subjectIdsWithNote.add(ca.subjectId);
            });
        }

        // Filtro por lapso/momento (opcional): las materias sin nota en ESE
        // lapso muestran "Sin calificar" (no un 0 engañoso) — la hasNote se
        // evalúa contra el lapso con el helper del módulo de agregación.
        const periodId = (request.query as any)?.periodId || undefined;

    const subjectAverages: { [subjectId: string]: { id: string; average: number; name: string; color: string; } } = {};
    const subjectGrades: { [subjectId: string]: number[] } = {};
    let totalAverageSum = 0;
    let failedSubjects = 0;
    let activeSubjectsWithGrades = 0;

    const allSubjectIds = [...new Set([...assignedMap.keys(), ...subjectIdsWithNote])];
    for (const subjectId of allSubjectIds) {
        const s = assignedMap.get(subjectId);
        const name = s?.name || 'N/A';
        const color = s?.color || '#666';
        const hasNote = periodId
            ? (await studentsWithNoteInSubject(prisma as any, student.classroom!.id, subjectId, periodId)).has(id)
            : subjectIdsWithNote.has(subjectId);
        const average = hasNote
            ? parseFloat((await gradesService.calculateWeightedSubjectAverage(prisma as any, id, subjectId, periodId)).toFixed(1))
            : 0;
        subjectAverages[subjectId] = { id: subjectId, average, name, color };

        if (hasNote) {
            subjectGrades[subjectId] = [average];
            totalAverageSum += average;
            activeSubjectsWithGrades++;
            if (average < 10) { // Nota mínima aprobatoria 10/20
                failedSubjects++;
            }
        }
    }

    let globalAverage = 0;
    if (activeSubjectsWithGrades > 0) {
        globalAverage = parseFloat((totalAverageSum / activeSubjectsWithGrades).toFixed(1));
    }

    // --- KPIs: Asistencia ---
    let attendancePercentage = 0;
    // GUARD: Verificar que attendance existe y es un array
    const totalDays = student.attendance?.length || 0;

    if (totalDays > 0 && Array.isArray(student.attendance)) {
      const positiveAttendance = student.attendance.filter(
        a => a?.status === 'PRESENT' || a?.status === 'LATE'
      ).length;
      attendancePercentage = Math.round((positiveAttendance / totalDays) * 100);
    }

    // --- Construir Respuesta JSON conforme al requerimiento ---
    const response = {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`,
        avatar: student.avatar || null,
        // Compatibilidad hacia atrás y nuevo formato
        section: student.classroom ? `${student.classroom.grade}to Año "${student.classroom.section}"` : "Sin Aula",
        currentSection: student.classroom ? {
          id: student.classroom.id,
          name: `${student.classroom.grade}to Año "${student.classroom.section}"`,
          guideTeacher: student.classroom.teacher
            ? `${student.classroom.teacher.firstName} ${student.classroom.teacher.lastName}`
            : null
        } : null
      },
      kpis: {
        globalAverage,
        failedSubjects,
        attendancePercentage,
        totalObservations
      },
      // Historial Académico
      academicHistory: (student as any).academicHistory?.map((record: any) => ({
        yearName: record.academicYear.name,
        section: record.sectionSnapshot,
        finalGrade: record.finalAverage,
        status: record.status
      })) || [],
      // Materias Actuales (using calculated averages)
      subjects: Object.values(subjectAverages).map(s => ({
        id: s.id, // Assuming subjectAverages stores subject ID
        name: s.name,
        average: s.average,
        color: s.color,
        status: s.average >= 10 ? "Aprobado" : "Reprobado"
      })),
      recentObservations: student.observations.map(o => ({
        id: o.id,
        title: o.title,
        type: o.type, // POSITIVE, NEGATIVE
        date: o.date.toISOString().split('T')[0]
      }))
    };

    return reply.status(200).send(response);


  } catch (error) {
    logger.error('Error al obtener dashboard de estudiante', { error, studentId: request.params.id });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
}

/**
 * Obtener estudiantes disponibles (OPTIMIZADO y CORREGIDO)
 * Implementa correctamente "The Archivist Rule":
 * Un estudiante SOLO puede estar en UNA sección por año académico
 */
export async function getAvailableStudents(
  request: FastifyRequest<{ Querystring: { search?: string; academicYearId?: string } }>,
  reply: FastifyReply
) {
  try {
    const prisma = request.tenantPrisma;
    const instituteId = (request.user as any).instituteId;
    const { search, academicYearId } = request.query;

    logger.info('Solicitando estudiantes disponibles...', { instituteId, search, academicYearId });

    // Base query: students belonging to this institute
    const whereClause: any = {
      role: UserRole.STUDENT,
      isActive: true,
    };

    if (search) {
      whereClause.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { studentCode: { contains: search, mode: 'insensitive' } }
      ];
    }

    // CORRECCIÓN CRÍTICA: Implementar "The Archivist Rule" correctamente
    // Verificar en la tabla StudentClassroom (la fuente de verdad para inscripciones)
    if (academicYearId) {
      // Excluir estudiantes que ya tienen una inscripción ACTIVA en este año académico
      whereClause.NOT = {
        studentClassrooms: {
          some: {
            academicYearId: academicYearId,
            isActive: true
          }
        }
      };
    } else {
      // Fallback: estudiantes sin ninguna inscripción activa
      whereClause.NOT = {
        studentClassrooms: {
          some: {
            isActive: true
          }
        }
      };
    }

    const students = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatar: true,
        studentCode: true,
        // Incluir información de inscripciones previas para contexto
        studentClassrooms: {
          where: {
            isActive: false // Solo inscripciones pasadas
          },
          select: {
            classroom: {
              select: {
                grade: true,
                section: true
              }
            },
            academicYear: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1 // Solo la más reciente
        }
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ],
      take: 50 // Limit to avoid massive payload
    });

    // Transform para incluir información útil del historial
    const mappedStudents = students.map(s => {
      const lastEnrollment = s.studentClassrooms[0];

      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        avatar: s.avatar,
        studentCode: s.studentCode,
        currentStatus: lastEnrollment
          ? `Último: ${lastEnrollment.academicYear.name} - ${lastEnrollment.classroom.grade}° ${lastEnrollment.classroom.section}`
          : 'Nuevo estudiante',
        // No incluir el array completo de studentClassrooms en la respuesta
        studentClassrooms: undefined
      };
    });

    logger.info(`Estudiantes disponibles encontrados: ${students.length}`);

    return reply.send(mappedStudents);
  } catch (error) {
    logger.error('Error al obtener estudiantes disponibles', { error });
    return reply.status(500).send({
      error: 'Error en el servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}

