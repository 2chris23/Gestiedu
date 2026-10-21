/// <reference path="../../types/fastify.d.ts" />
import { UserRole } from '../../utils/prisma-enums';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { getAcademicConfig } from '../../services/promotion/configuracion-academica';
import { cifrasOficialesDeLaSeccion, notaOficial, promedioOficial, asistenciaEnBloque } from '../../services/cifras-oficiales.service';

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

    // --- KPIs: las cifras OFICIALES (la cuenta de la boleta), las mismas del
    // Inicio del alumno, la lista y el resumen de la sección
    // (`cifras-oficiales.service`, `scripts/barrido-de-cifras.ts`).
    const periodId = (request.query as any)?.periodId || undefined;
    const instId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
    let minPassing = 10;
    try {
      if (instId) {
        const config = await getAcademicConfig(instId);
        minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
      }
    } catch {
      minPassing = 10;
    }
    const classroomSubjects = activeClassroom?.id
        ? await prisma.classroomSubject.findMany({
            where: { classroomId: activeClassroom.id },
            include: { subject: { select: { id: true, name: true, color: true, evaluacion: true } } },
        })
        : [];
    const oficiales = activeClassroom?.id && instId
        ? (await cifrasOficialesDeLaSeccion(prisma as any, instId, activeClassroom.id, [id])).get(id)
        : undefined;

    const subjectAverages: { [subjectId: string]: { id: string; average: number; hasGrades: boolean; name: string; color: string; } } = {};
    let failedSubjects = 0;
    for (const cs of classroomSubjects as any[]) {
        if (cs.subject.evaluacion === 'CUALITATIVA') continue;
        const nota = notaOficial(oficiales, cs.subjectId, periodId);
        subjectAverages[cs.subjectId] = { id: cs.subjectId, average: nota ?? 0, hasGrades: nota !== null, name: cs.subject.name, color: cs.subject.color || '#666' };
        if (nota !== null && nota < minPassing) failedSubjects++;
    }
    const globalAverage = promedioOficial(oficiales, periodId) ?? 0;

    // Identificar el año académico y fechas del ciclo seleccionado
    const targetAcademicYearId = selectedEnrollment?.academicYearId || activeClassroom?.academicYearId || requestedYearId;
    const academicYearStartDate = selectedEnrollment?.academicYear?.startDate || activeClassroom?.academicYear?.startDate;
    const academicYearEndDate = selectedEnrollment?.academicYear?.endDate || activeClassroom?.academicYear?.endDate;

    // --- KPIs: Asistencia del ciclo (o del lapso pedido), la misma cuenta de
    // la lista y del Inicio del alumno (`asistenciaEnBloque`).
    let ventanaAsistencia: { desde?: Date | null; hasta?: Date | null } = { desde: academicYearStartDate, hasta: academicYearEndDate };
    if (periodId) {
      const period = await prisma.period.findUnique({ where: { id: periodId }, select: { startDate: true, endDate: true } });
      if (period?.startDate && period?.endDate) ventanaAsistencia = { desde: period.startDate, hasta: period.endDate };
    }
    const asistencia = (await asistenciaEnBloque(prisma as any, [id], ventanaAsistencia)).get(id);
    const attendancePercentage = Math.round(asistencia?.porcentaje ?? 0);

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

    const historial = new Map<string, number | null>();
    await Promise.all(enrollments.map(async (sc: any) => {
      if (!instId || !sc.classroomId) return;
      historial.set(sc.classroomId, sc.classroomId === activeClassroom?.id
        ? (oficiales?.definitivo ?? null)
        : ((await cifrasOficialesDeLaSeccion(prisma as any, instId, sc.classroomId, [id])).get(id)?.definitivo ?? null));
    }));

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
      // El de cada ciclo, con la cuenta oficial (la de su boleta): antes salía
      // el número guardado al cerrar, que no era el de la boleta.
      // Si hay expediente (el cierre o el traslado lo dejan), ese; si no, las
      // inscripciones. La nota: la oficial de ese ciclo si tiene notas aquí; si
      // no (venía de otro plantel), la del expediente.
      academicHistory: ((student as any).academicHistory && (student as any).academicHistory.length > 0)
        ? (student as any).academicHistory.map((record: any) => {
            const sc = enrollments.find((e: any) => e.academicYearId === record.academicYearId);
            return {
              academicYearId: record.academicYearId,
              yearName: record.academicYear?.name || 'Ciclo Escolar',
              section: record.sectionSnapshot,
              finalGrade: (sc ? historial.get(sc.classroomId) : null) ?? record.finalAverage,
              status: record.status
            };
          })
        : enrollments.map((sc: any) => ({
            academicYearId: sc.academicYearId,
            yearName: sc.academicYear?.name || sc.classroom?.academicYear?.name || 'Ciclo Escolar',
            section: sc.classroom?.name || `${sc.classroom?.grade}° ${sc.classroom?.section}`,
            finalGrade: historial.get(sc.classroomId) ?? 0,
            status: sc.academicYear?.status || 'COMPLETED',
            isCurrent: sc.id === selectedEnrollment?.id
          })),
      // Materias Actuales (using calculated averages)
      subjects: Object.values(subjectAverages).map(s => ({
        id: s.id, // Assuming subjectAverages stores subject ID
        name: s.name,
        average: s.average,
        // Un 0 es una nota; «sin notas» no (CERO-*).
        hasGrades: s.hasGrades,
        color: s.color,
        status: s.average >= minPassing ? "Aprobado" : "Reprobado"
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
