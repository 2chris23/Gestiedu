import { UserRole, ActionType } from '../utils/prisma-enums';
import * as crypto from 'crypto';
/// <reference path="../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateUserInput, UpdateUserInput, UserFiltersInput, PaginationInput } from '../utils/validators';
import { logger } from '../utils/logger';
import { teacherClassroomIds } from '../services/authorization.service';
import { createAuditLogger } from '../services/audit.service'; // ✅ SECURITY: Audit logging
import { gradesService } from '../services/grades.service'; // promedio ponderado unificado (Fase 2.5)
import { studentsWithNoteInSubject } from '../services/aggregation.service'; // filtro por lapso (Fase 3.5)
import { getAcademicConfig } from '../services/promotion/close-cycle.service';
import { studentsService } from '../services/students.service';
import { bulkSubjectAveragesConDatos, BulkAverageDetail } from '../services/bulk-averages.service';

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
  Querystring: UserFiltersInput & PaginationInput & { periodId?: string; subjectId?: string };
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
  const studentData = { ...request.body } as any;

  // El schema JSON declara `birthDate` como 'date' (YYYY-MM-DD) y Prisma espera
  // DateTime. El service no normaliza fechas, así que se hace aquí, que es donde
  // vive el formato de transporte.
  if (studentData.birthDate && !String(studentData.birthDate).includes('T')) {
    studentData.birthDate = new Date(studentData.birthDate).toISOString();
  }

  // `User.id` es la cédula y NO tiene default en Prisma: si el admin no la manda
  // hay que generar algo. Se conserva el comportamiento anterior del controller.
  if (!studentData.id) {
    studentData.id = crypto.randomUUID();
  }

  // La lógica de negocio (duplicados, capacidad del aula y la matrícula real en
  // StudentClassroom) vive SOLO en el service. Los errores de dominio suben al
  // handler central, que ya mapea NotFoundError → 404 y ConflictError → 409.
  const student = await studentsService.createStudent(request.tenantPrisma, studentData);

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
    success: true,
    message: 'Estudiante creado exitosamente',
    data: { ...student, password: undefined },
  });
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

    // Un profesor solo ve a los estudiantes de SUS secciones (las que imparte o
    // de las que es guía). Antes veía a los de cualquier sección del liceo.
    const actor: any = request.user;
    if (actor?.role === 'TEACHER') {
      const suyas = await teacherClassroomIds(request.tenantPrisma, actor.userId ?? actor.id);
      if (classroomId && !suyas.includes(classroomId)) {
        return reply.status(403).send({
          error: 'Solo puedes ver a los estudiantes de tus secciones',
          code: 'FORBIDDEN',
        });
      }
      if (!classroomId) {
        where.studentClassrooms = { some: { classroomId: { in: suyas }, isActive: true } };
      }
    }

    if (classroomId) {
      where.studentClassrooms = { some: { classroomId, isActive: true } };
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
          studentClassrooms: {
            where: { isActive: true },
            take: 1,
            select: {
              classroom: {
                select: {
                  id: true,
                  name: true,
                  grade: true,
                  section: true,
                },
              },
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

    // OPTIMIZACIÓN: Calcular estadísticas con query agregada en lugar de traer todos los datos
    const studentIds = students.map(s => s.id);

    /**
     * LA SECCIÓN DE CADA ALUMNO
     *
     * Con una sección elegida, es esa. Sin sección (la lista de todo el liceo,
     * o la de un profesor con todas las suyas), es la sección activa de cada
     * uno. Todo lo de abajo se calcula POR SECCIÓN y en bloque: sin esto, los
     * promedios salían 0 para todo el mundo, el de una materia se hacía alumno
     * por alumno, y las notas de Clase en Vivo se buscaban en el liceo entero.
     * `lista-de-alumnos-en-bloque.test.ts`.
     */
    const seccionDe = new Map<string, string>();
    for (const st of students as any[]) {
      const suya = classroomId ?? st.studentClassrooms?.[0]?.classroom?.id;
      if (suya) seccionDe.set(st.id, suya);
    }
    const secciones = [...new Set(seccionDe.values())];
    const alumnosPorSeccion = new Map<string, string[]>();
    for (const [sid, aula] of seccionDe) {
      if (!alumnosPorSeccion.has(aula)) alumnosPorSeccion.set(aula, []);
      alumnosPorSeccion.get(aula)!.push(sid);
    }

    /**
     * El ciclo de esas secciones: sus lapsos (para las notas) y sus fechas
     * (para la asistencia). Sin esto se miraba toda la vida escolar de cada
     * alumno: en quinto año, cinco veces más filas para responder lo mismo, y
     * un porcentaje de asistencia que arrastraba los años anteriores.
     */
    const ciclos = secciones.length
      ? await request.tenantPrisma.academicYear.findMany({
          where: { classrooms: { some: { id: { in: secciones } } } },
          select: { startDate: true, endDate: true, periods: { select: { id: true } } },
        })
      : [];
    const lapsosDelCiclo: string[] = ciclos.flatMap((c) => c.periods.map((p) => p.id));
    const desde = ciclos.length ? new Date(Math.min(...ciclos.map((c) => c.startDate.getTime()))) : null;
    const hasta = ciclos.length ? new Date(Math.max(...ciclos.map((c) => c.endDate.getTime()))) : null;

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
        ${desde && hasta ? `AND a.date >= $${studentIds.length + 1} AND a.date <= $${studentIds.length + 2}` : ''}
      WHERE u.id IN (${studentIds.map((_, i) => `$${i + 1}`).join(',')})
      GROUP BY u.id
    `;

    /**
     * LO QUE NO DEPENDE DE LO DEMÁS, A LA VEZ
     *
     * La asistencia, las materias con nota, las notas de Clase en Vivo, la
     * nota mínima del liceo y las observaciones no se necesitan entre sí, y se
     * pedían una detrás de otra: cada espera se sumaba a la siguiente. Con 500
     * personas repartidas en 50 liceos, esta lista era la única pantalla con
     * el p95 por encima de 300 ms (358 ms medidos). Ahora salen juntas.
     */
    const pedirAsistencia = studentIds.length > 0
      ? request.tenantPrisma.$queryRawUnsafe<Array<{
        studentId: string;
        attendancePercentage: number;
      }>>(attendanceQuery, ...studentIds, ...(desde && hasta ? [desde, hasta] : []))
      : Promise.resolve([] as Array<{ studentId: string; attendancePercentage: number }>);

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

    /**
     * Los lapsos del ciclo de esta sección, para no mirar toda la vida escolar.
     *
     * Sin este filtro, la consulta de abajo recorre TODAS las notas que esos
     * alumnos han tenido nunca. Un liceo acumula años: en quinto año son cinco
     * veces más filas para responder lo mismo, y cada septiembre empeora.
     *
     * Los años anteriores siguen enteros en la base; lo que cambia es qué se
     * mira para pintar esta lista.
     */
    // (Los lapsos del ciclo se sacan arriba, con la sección de cada alumno.)

    // La materia pedida, por id, slug o código: hace falta para las
    // observaciones, que salen a la vez que lo demás.
    let targetSubjectId = request.query?.subjectId;
    if (targetSubjectId) {
      const isCuid = /^c[a-z0-9]{24}$/.test(targetSubjectId);
      if (!isCuid) {
        const foundSub = await request.tenantPrisma.subject.findFirst({
          where: { OR: [{ id: targetSubjectId }, { slug: targetSubjectId }, { code: targetSubjectId }] },
          select: { id: true },
        });
        if (foundSub) {
          targetSubjectId = foundSub.id;
        }
      }
    }

    // Nota mínima aprobatoria del instituto (10 solo como valor por defecto)
    const pedirNotaMinima = (async () => {
      try {
        const instId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
        if (!instId) return 10;
        const config = await getAcademicConfig(instId);
        return typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
      } catch {
        return 10;
      }
    })();

    // Contar observaciones registradas por estudiante (filtradas por materia y lapso si aplica)
    const pedirObservaciones = (async () => {
      if (studentIds.length === 0) return [];
      let obsPeriodFilter: any = {};
      if (request.query?.periodId) {
        const period = await request.tenantPrisma.period.findUnique({
          where: { id: request.query.periodId },
          select: { startDate: true, endDate: true },
        });
        if (period) {
          obsPeriodFilter = { date: { gte: period.startDate, lte: period.endDate } };
        }
      }
      return request.tenantPrisma.observation.groupBy({
        by: ['studentId'],
        where: {
          studentId: { in: studentIds },
          ...(targetSubjectId ? { subjectId: targetSubjectId } : {}),
          ...(obsPeriodFilter.date ? obsPeriodFilter : {}),
        },
        _count: { id: true },
      });
    })();

    const [attendanceStats, gradeSubjects, classActs, minPassing, observationsStats] = await Promise.all([
      pedirAsistencia,
      // Materias con grades por estudiante
      studentIds.length === 0 ? Promise.resolve([] as Array<{ studentId: string; subjectId: string }>) : request.tenantPrisma.grade.groupBy({
        by: ['studentId', 'subjectId'],
        where: {
          studentId: { in: studentIds },
          ...(lapsosDelCiclo.length > 0 ? { periodId: { in: lapsosDelCiclo } } : {}),
        },
      }),
      // Materias con ClassActivity scoreadas (JSON scores) por estudiante
      studentIds.length === 0 || secciones.length === 0 ? Promise.resolve([] as Array<{ subjectId: string; scores: any }>) : request.tenantPrisma.classActivity.findMany({
        where: { classroomId: { in: secciones }, scores: { not: undefined } },
        select: { subjectId: true, scores: true },
      }),
      pedirNotaMinima,
      pedirObservaciones,
    ]);

    if (studentIds.length > 0) {
      gradeSubjects.forEach(g => {
        if (!subjectIdsByStudent.has(g.studentId)) subjectIdsByStudent.set(g.studentId, new Set());
        subjectIdsByStudent.get(g.studentId)!.add(g.subjectId);
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

    // PROMEDIO — si se especifica subjectId, calcular promedio ponderado del estudiante en esa materia;
    // de lo contrario, calcular promedio general sobre todas sus materias.
    const averages = new Map<string, number>();
    // Quién tiene alguna nota: un 0 es una nota y no es lo mismo que «sin
    // calificar» (CERO-06). La pantalla lo necesita para no pintar un 0 como
    // si no hubiera nada.
    const conNotas = new Set<string>();

    const studentFailedSubjectsMap = new Map<string, Array<{ subjectId: string; average: number }>>();

    if (targetSubjectId) {
      // En bloque, una vez por sección: 4 consultas por sección en vez de ~20
      // por estudiante.
      const bulk: BulkAverageDetail = new Map();
      const porSeccion = await Promise.all(
        [...alumnosPorSeccion].map(([aula, deEsta]) =>
          bulkSubjectAveragesConDatos(request.tenantPrisma, {
            classroomId: aula,
            studentIds: deEsta,
            subjectIds: [targetSubjectId!],
            periodId: request.query?.periodId,
          })
        )
      );
      for (const r of porSeccion) r.forEach((v, k) => bulk.set(k, v));

      await Promise.all(
        studentIds.map(async (sid) => {
          try {
            // Solo quien no tiene sección se calcula aparte.
            const detalle = bulk.has(sid)
              ? bulk.get(sid)?.get(targetSubjectId!) ?? { promedio: 0, conNotas: false }
              : await gradesService.promedioDeLaMateria(
                  request.tenantPrisma,
                  sid,
                  targetSubjectId!,
                  request.query?.periodId
                );
            const roundedAvg = detalle.conNotas ? Math.round(detalle.promedio * 10) / 10 : 0;
            averages.set(sid, roundedAvg);
            if (detalle.conNotas) conNotas.add(sid);
            if (detalle.conNotas && roundedAvg < minPassing) {
              studentFailedSubjectsMap.set(sid, [{ subjectId: targetSubjectId!, average: roundedAvg }]);
            }
          } catch {
            averages.set(sid, 0);
          }
        })
      );
    } else {
      // Promedio general = promedio de sus materias, con las MISMAS reglas que
      // la vista por materia. Antes esta rama miraba solo la tabla `grades`, así
      // que una nota puesta en Clase en Vivo no contaba y salía "Sin calificar".
      const todasLasMaterias = Array.from(
        new Set(Array.from(subjectIdsByStudent.values()).flatMap(set => Array.from(set)))
      );

      const bulk: BulkAverageDetail = new Map();
      if (todasLasMaterias.length > 0) {
        const porSeccion = await Promise.all(
          [...alumnosPorSeccion].map(([aula, deEsta]) =>
            bulkSubjectAveragesConDatos(request.tenantPrisma, {
              classroomId: aula,
              studentIds: deEsta,
              subjectIds: todasLasMaterias,
              periodId: request.query?.periodId,
            })
          )
        );
        for (const r of porSeccion) r.forEach((v, k) => bulk.set(k, v));
      }

      studentIds.forEach(sid => {
        const materias = Array.from(subjectIdsByStudent.get(sid) ?? []);
        const notas: number[] = [];

        materias.forEach(subjectId => {
          const detalle = bulk?.get(sid)?.get(subjectId);
          if (detalle?.conNotas) {
            const nota = detalle.promedio;
            notas.push(nota);
            if (nota < minPassing) {
              if (!studentFailedSubjectsMap.has(sid)) studentFailedSubjectsMap.set(sid, []);
              studentFailedSubjectsMap.get(sid)!.push({ subjectId, average: Math.round(nota * 10) / 10 });
            }
          }
        });

        averages.set(
          sid,
          notas.length > 0 ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : 0
        );
        if (notas.length > 0) conNotas.add(sid);
      });
    }

    const attendanceMap = new Map(
      attendanceStats.map(s => [s.studentId, Math.round(Number(s.attendancePercentage || 0))])
    );

    const observationsMap = new Map(observationsStats.map(o => [o.studentId, o._count.id]));

    // Combinar datos de estudiantes con estadísticas
    const studentsWithStats = students.map((student: any) => {
      const average = averages.get(student.id) || 0;
      const attendancePercentage = attendanceMap.get(student.id) || 0;
      const observationsCount = observationsMap.get(student.id) || 0;
      const activeClassroom = student.studentClassrooms?.[0]?.classroom || null;
      const failedSubjects = studentFailedSubjectsMap.get(student.id) || [];

      return {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        avatar: student.avatar,
        studentCode: student.studentCode,
        isActive: student.isActive,
        classroom: activeClassroom,
        average,
        hasGrades: conNotas.has(student.id),
        failedSubjectsCount: failedSubjects.length,
        failedSubjects,
        attendancePercentage,
        observationsCount,
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
  const { id } = request.params;

  // Este handler tenía el MISMO problema que create/update: pedía
  // `include: { classroom, institute }`, relaciones que la migración eliminó de
  // `User`. `studentsService.getStudentById` ya trae las relaciones vigentes
  // (studentClassrooms → classroom → teacher) y lanza NotFoundError → 404.
  const student = await studentsService.getStudentById(request.tenantPrisma, id);

  return reply.status(200).send({
    student: { ...student, password: undefined },
  });
}

/**
 * Controlador para actualizar un estudiante
 */
export async function updateStudent(
  request: FastifyRequest<UpdateStudentRequest>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const updateData = { ...request.body } as any;

  if (updateData.birthDate && !String(updateData.birthDate).includes('T')) {
    updateData.birthDate = new Date(updateData.birthDate).toISOString();
  }

  // Igual que en `createStudent`: el service es el dueño de la lógica. Su
  // `updateStudent` hace el upsert del StudentClassroom del año académico
  // correspondiente, que es lo que el controller hacía mal contra el modelo viejo.
  const student = await studentsService.updateStudent(request.tenantPrisma, id, updateData);

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
    success: true,
    message: 'Estudiante actualizado exitosamente',
    data: { ...student, password: undefined },
  });
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

    // Consultar datos base del estudiante
    const student = await prisma.user.findUnique({
      where: { id, role: UserRole.STUDENT },
      include: {
        studentClassrooms: {
          where: { isActive: true },
          orderBy: [
            { academicYear: { startDate: 'desc' } },
            { createdAt: 'desc' }
          ],
          include: {
            classroom: {
              include: {
                teacher: {
                  select: { firstName: true, lastName: true }
                },
                academicYear: {
                  select: { id: true, name: true, status: true, startDate: true, endDate: true }
                }
              }
            },
            academicYear: {
              select: { id: true, name: true, status: true, startDate: true, endDate: true }
            }
          }
        },
        // @ts-ignore - Propiedad recién agregada al schema
        academicHistory: {
          include: {
            academicYear: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
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
    });

    if (!student) {
      return reply.status(404).send({
        error: 'Estudiante no encontrado',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    const enrollments = (student as any).studentClassrooms || [];
    const requestedYearId = (request.query as any)?.academicYearId;
    const selectedEnrollment = requestedYearId
      ? enrollments.find((e: any) => e.academicYearId === requestedYearId || e.classroom?.academicYear?.id === requestedYearId) || enrollments[0]
      : enrollments[0];

    const activeClassroom = selectedEnrollment?.classroom || null;

    // --- KPIs: Promedio Global y Materias (JERARQUÍA — Nivel 2 por materia) ---
    const classroomSubjects = activeClassroom?.id
        ? await prisma.classroomSubject.findMany({
            where: { classroomId: activeClassroom.id },
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
        if (activeClassroom?.id) {
            const classActs = await prisma.classActivity.findMany({
                where: { classroomId: activeClassroom.id, scores: { not: undefined } },
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
    let minPassing = 10;
    try {
      const instId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
      if (instId) {
        const config = await getAcademicConfig(instId);
        minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
      }
    } catch {
      minPassing = 10;
    }

    let failedSubjects = 0;
    let activeSubjectsWithGrades = 0;

    const allSubjectIds = [...new Set([...assignedMap.keys(), ...subjectIdsWithNote])];
    for (const subjectId of allSubjectIds) {
        const s = assignedMap.get(subjectId);
        const name = s?.name || 'N/A';
        const color = s?.color || '#666';
        const hasNote = periodId
            ? (activeClassroom ? (await studentsWithNoteInSubject(prisma as any, activeClassroom.id, subjectId, periodId)).has(id) : false)
            : subjectIdsWithNote.has(subjectId);
        const average = hasNote
            ? parseFloat((await gradesService.calculateWeightedSubjectAverage(prisma as any, id, subjectId, periodId)).toFixed(1))
            : 0;
        subjectAverages[subjectId] = { id: subjectId, average, name, color };

        if (hasNote) {
            subjectGrades[subjectId] = [average];
            totalAverageSum += average;
            activeSubjectsWithGrades++;
            if (average < minPassing) { // Nota mínima aprobatoria configurable
                failedSubjects++;
            }
        }
    }

    let globalAverage = 0;
    if (activeSubjectsWithGrades > 0) {
        globalAverage = parseFloat((totalAverageSum / activeSubjectsWithGrades).toFixed(1));
    }

    // Identificar el año académico y fechas del ciclo seleccionado
    const targetAcademicYearId = selectedEnrollment?.academicYearId || activeClassroom?.academicYearId || requestedYearId;
    const academicYearStartDate = selectedEnrollment?.academicYear?.startDate || activeClassroom?.academicYear?.startDate;
    const academicYearEndDate = selectedEnrollment?.academicYear?.endDate || activeClassroom?.academicYear?.endDate;

    // --- KPIs: Asistencia (filtrada por aula / ciclo escolar y lapso) ---
    const attendanceFilter: any = { studentId: id };
    if (activeClassroom?.id) {
      attendanceFilter.classroomId = activeClassroom.id;
    } else if (academicYearStartDate && academicYearEndDate) {
      attendanceFilter.date = {
        gte: academicYearStartDate,
        lte: academicYearEndDate
      };
    }

    if (periodId) {
      const period = await prisma.period.findUnique({
        where: { id: periodId },
        select: { startDate: true, endDate: true }
      });
      if (period?.startDate && period?.endDate) {
        attendanceFilter.date = {
          gte: period.startDate,
          lte: period.endDate
        };
      }
    }

    const cycleAttendance = await prisma.dailyAttendance.findMany({
      where: attendanceFilter,
      select: { status: true }
    });

    let attendancePercentage = 0;
    const totalDays = cycleAttendance.length;
    if (totalDays > 0) {
      const positiveAttendance = cycleAttendance.filter(
        (a: any) => a.status === 'PRESENT' || a.status === 'LATE'
      ).length;
      attendancePercentage = Math.round((positiveAttendance / totalDays) * 100);
    }

    // --- Observaciones Filtradas Estrictamente por Ciclo Escolar y Lapso ---
    const obsFilter: any = {
      studentId: id,
    };

    if (activeClassroom?.id && targetAcademicYearId) {
      obsFilter.OR = [
        { classroomId: activeClassroom.id },
        { classroom: { academicYearId: targetAcademicYearId } },
        { classSession: { classroomId: activeClassroom.id } },
        { classSession: { classroom: { academicYearId: targetAcademicYearId } } }
      ];
      if (academicYearStartDate && academicYearEndDate) {
        obsFilter.OR.push({
          classroomId: null,
          classSessionId: null,
          date: {
            gte: academicYearStartDate,
            lte: academicYearEndDate
          }
        });
      }
    } else if (activeClassroom?.id) {
      obsFilter.OR = [
        { classroomId: activeClassroom.id },
        { classSession: { classroomId: activeClassroom.id } }
      ];
    } else if (targetAcademicYearId) {
      obsFilter.OR = [
        { classroom: { academicYearId: targetAcademicYearId } },
        { classSession: { classroom: { academicYearId: targetAcademicYearId } } }
      ];
      if (academicYearStartDate && academicYearEndDate) {
        obsFilter.OR.push({
          classroomId: null,
          classSessionId: null,
          date: {
            gte: academicYearStartDate,
            lte: academicYearEndDate
          }
        });
      }
    }

    if (periodId) {
      const period = await prisma.period.findUnique({
        where: { id: periodId },
        select: { startDate: true, endDate: true }
      });
      if (period?.startDate && period?.endDate) {
        obsFilter.date = {
          gte: period.startDate,
          lte: period.endDate
        };
      }
    }

    const [cycleObservations, totalObservations] = await Promise.all([
      prisma.observation.findMany({
        where: obsFilter,
        include: {
          createdBy: {
            select: { firstName: true, lastName: true }
          },
          subject: {
            select: { id: true, name: true, color: true }
          },
          classroom: {
            select: { id: true, name: true }
          },
          classSession: {
            include: {
              classroom: { select: { id: true, name: true } },
              subject: { select: { id: true, name: true, color: true } }
            }
          }
        },
        orderBy: { date: 'desc' },
        take: 50
      }),
      prisma.observation.count({ where: obsFilter })
    ]);

    // --- Construir Respuesta JSON conforme al requerimiento ---
    const response = {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`,
        avatar: student.avatar || null,
        // Compatibilidad hacia atrás y nuevo formato
        section: activeClassroom ? activeClassroom.name : "Sin Aula",
        currentSection: activeClassroom ? {
          id: activeClassroom.id,
          name: activeClassroom.name,
          academicYearId: selectedEnrollment?.academicYear?.id || activeClassroom.academicYear?.id || null,
          academicYearName: selectedEnrollment?.academicYear?.name || activeClassroom.academicYear?.name || null,
          academicYearStatus: selectedEnrollment?.academicYear?.status || activeClassroom.academicYear?.status || null,
          guideTeacher: activeClassroom.teacher
            ? `${activeClassroom.teacher.firstName} ${activeClassroom.teacher.lastName}`
            : null
        } : null,
        enrollments: enrollments.map((sc: any) => ({
          id: sc.id,
          classroomId: sc.classroomId,
          classroomName: sc.classroom?.name,
          grade: sc.classroom?.grade,
          section: sc.classroom?.section,
          academicYearId: sc.academicYearId,
          academicYearName: sc.academicYear?.name || sc.classroom?.academicYear?.name,
          startDate: sc.academicYear?.startDate || sc.classroom?.academicYear?.startDate,
          status: sc.academicYear?.status || sc.classroom?.academicYear?.status,
          isActive: sc.isActive,
          isCurrent: sc.id === selectedEnrollment?.id
        }))
      },
      kpis: {
        globalAverage,
        failedSubjects,
        attendancePercentage,
        totalObservations
      },
      enrollments: enrollments.map((sc: any) => ({
        id: sc.id,
        classroomId: sc.classroomId,
        classroomName: sc.classroom?.name,
        grade: sc.classroom?.grade,
        section: sc.classroom?.section,
        academicYearId: sc.academicYearId,
        academicYearName: sc.academicYear?.name || sc.classroom?.academicYear?.name,
        startDate: sc.academicYear?.startDate || sc.classroom?.academicYear?.startDate,
        status: sc.academicYear?.status || sc.classroom?.academicYear?.status,
        isActive: sc.isActive,
        isCurrent: sc.id === selectedEnrollment?.id
      })),
      // Historial Académico por Ciclo Escolar
      academicHistory: ((student as any).academicHistory && (student as any).academicHistory.length > 0)
        ? (student as any).academicHistory.map((record: any) => ({
            academicYearId: record.academicYearId,
            yearName: record.academicYear?.name || 'Ciclo Escolar',
            section: record.sectionSnapshot,
            finalGrade: record.finalAverage,
            status: record.status
          }))
        : enrollments.map((sc: any) => ({
            academicYearId: sc.academicYearId,
            yearName: sc.academicYear?.name || sc.classroom?.academicYear?.name || 'Ciclo Escolar',
            section: sc.classroom?.name || `${sc.classroom?.grade}° ${sc.classroom?.section}`,
            finalGrade: 0,
            status: sc.academicYear?.status || 'COMPLETED',
            isCurrent: sc.id === selectedEnrollment?.id
          })),
      // Materias Actuales (using calculated averages)
      subjects: Object.values(subjectAverages).map(s => ({
        id: s.id, // Assuming subjectAverages stores subject ID
        name: s.name,
        average: s.average,
        color: s.color,
        status: s.average >= 10 ? "Aprobado" : "Reprobado"
      })),
      recentObservations: cycleObservations.map((o: any) => ({
        id: o.id,
        title: o.title,
        description: o.description || o.title,
        type: o.type, // POSITIVE, NEGATIVE
        date: o.date ? (typeof o.date === 'string' ? o.date : o.date.toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
        teacher: o.createdBy ? `${o.createdBy.firstName} ${o.createdBy.lastName}` : 'Docente',
        classroomId: o.classroomId || o.classSession?.classroomId || activeClassroom?.id,
        classroomName: o.classroom?.name || o.classSession?.classroom?.name || activeClassroom?.name,
        subjectId: o.subjectId || o.classSession?.subjectId,
        subjectName: o.subject?.name || o.classSession?.subject?.name,
        subjectColor: o.subject?.color || o.classSession?.subject?.color,
        classSessionId: o.classSessionId,
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

