/// <reference path="../../types/fastify.d.ts" />
import { UserRole } from '../../utils/prisma-enums';
import { FastifyRequest, FastifyReply } from 'fastify';
import { UserFiltersInput, PaginationInput } from '../../utils/validators';
import { logger } from '../../utils/logger';
import { teacherClassroomIds } from '../../services/authorization.service';
import { getAcademicConfig } from '../../services/promotion/configuracion-academica';
import { cifrasOficialesDeVariasSecciones, notaOficial, promedioOficial } from '../../services/cifras-oficiales.service';

interface GetStudentsRequest {
  Querystring: UserFiltersInput & PaginationInput & { periodId?: string; subjectId?: string };
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

    // PROMEDIO — la cifra OFICIAL (la cuenta de la boleta, `cifras-oficiales.service`),
    // en bloque por sección: la de la materia pedida o la general, del lapso
    // pedido o la definitiva. La misma que la ficha y el Inicio del alumno.
    const averages = new Map<string, number>();
    // Quién tiene alguna nota: un 0 es una nota y no es lo mismo que «sin
    // calificar» (CERO-06).
    const conNotas = new Set<string>();
    const studentFailedSubjectsMap = new Map<string, Array<{ subjectId: string; average: number }>>();
    const instDeLaLista = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    const periodoPedido = request.query?.periodId;
    if (instDeLaLista) {
      // Todas las secciones de la página con las mismas consultas.
      const porSeccion = (await cifrasOficialesDeVariasSecciones(
        request.tenantPrisma as any,
        instDeLaLista,
        [...alumnosPorSeccion].map(([aula, deEsta]) => ({ classroomId: aula, studentIds: deEsta }))
      )).values();
      for (const mapa of porSeccion) {
        for (const [sid, c] of mapa) {
          const valor = targetSubjectId ? notaOficial(c, targetSubjectId, periodoPedido) : promedioOficial(c, periodoPedido);
          if (valor !== null) {
            averages.set(sid, valor);
            conNotas.add(sid);
          }
          for (const [subjectId, m] of c.materias) {
            if (targetSubjectId && subjectId !== targetSubjectId) continue;
            const nota = periodoPedido ? m.notas[periodoPedido] : m.queCuenta;
            if (nota !== null && nota !== undefined && nota < minPassing) {
              if (!studentFailedSubjectsMap.has(sid)) studentFailedSubjectsMap.set(sid, []);
              studentFailedSubjectsMap.get(sid)!.push({ subjectId, average: nota });
            }
          }
        }
      }
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
