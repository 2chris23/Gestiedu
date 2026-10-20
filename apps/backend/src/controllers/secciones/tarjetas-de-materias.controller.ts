/// <reference path="../../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger';
import { promediosDeLaSeccion } from '../../services/aggregation.service';
import { getAcademicConfig } from '../../services/promotion/configuracion-academica';

interface GetClassroomSubjectsStatsRequest {
    Params: {
        classroomId: string;
    };
    Querystring: {
        periodId?: string;
    };
}

/**
 * Obtener estadísticas de todas las materias asignadas a una sección
 */
export async function getClassroomSubjectsStats(
    request: FastifyRequest<GetClassroomSubjectsStatsRequest>,
    reply: FastifyReply
) {
    try {
        const { classroomId } = request.params;
        const periodId = request.query?.periodId || undefined;

        // Obtener materias asignadas
        const classroomSubjectsWhere: any = { classroomId };
        if (request.user?.role === 'TEACHER') {
            classroomSubjectsWhere.teacherId = request.user.userId;
        }

        const classroomSubjects = await request.tenantPrisma.classroomSubject.findMany({
            where: classroomSubjectsWhere,
            include: {
                subject: {
                    select: {
                        id: true,
                        name: true,
                        color: true,
                        code: true,
                        slug: true,
                        evaluacion: true,
                    },
                },
                teacher: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    },
                },
            },
        });

        // Obtener estudiantes de la sección
        const enrollments = await request.tenantPrisma.studentClassroom.findMany({
            where: {
                classroomId,
                isActive: true,
            },
            select: {
                studentId: true,
            },
        });

        const studentIds = enrollments.map(e => e.studentId);

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

        // Filtrar por fechas del periodo/lapso si fue especificado
        let periodDateFilter: any = {};
        if (periodId) {
            const period = await request.tenantPrisma.period.findUnique({
                where: { id: periodId },
                select: { startDate: true, endDate: true },
            });
            if (period) {
                periodDateFilter = {
                    gte: period.startDate,
                    lte: period.endDate,
                };
            }
        }

        // Calcular estadísticas para cada materia
        // CORRECCIÓN (jerarquía de agregación): el promedio de la materia es el
        // NIVEL 3 — promedio de los promedios NIVEL 2 por estudiante, excluyendo
        // a estudiantes sin notas (no cuentan como 0) e incluyendo notas de
        // ClassActivity.scores. Antes: promedio simple de AVG sobre la tabla
        // grades (ignoraba criterios ponderados y clases en vivo).
        /**
         * TODO EN BLOQUE Y CON LA CIFRA OFICIAL (20-oct-2026)
         *
         * Antes, por cada materia: su promedio, la asistencia de la sección (la
         * misma consulta una y otra vez), sus observaciones y, por cada alumno,
         * su promedio con la cuenta vieja (sin redondear como la boleta) para
         * saber si estaba en riesgo. Ahora la nota de cada alumno en cada
         * materia sale de UNA carga (`promediosDeLaSeccion`, la de la boleta);
         * en riesgo es quien tiene en esa materia una nota oficial por debajo
         * de la mínima, y la asistencia es la del resumen de la sección.
         */
        const subjectIds = classroomSubjects.map((cs) => cs.subjectId);
        const [notas, asistencia, observaciones] = await Promise.all([
            promediosDeLaSeccion(request.tenantPrisma, classroomId, periodId, subjectIds),
            studentIds.length > 0
                ? request.tenantPrisma.dailyAttendance.groupBy({
                      by: ['status'],
                      where: { studentId: { in: studentIds }, ...(periodDateFilter.gte ? { date: periodDateFilter } : {}) },
                      _count: { _all: true },
                  })
                : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
            studentIds.length > 0 && subjectIds.length > 0
                ? request.tenantPrisma.observation.groupBy({
                      by: ['subjectId'],
                      where: {
                          studentId: { in: studentIds },
                          subjectId: { in: subjectIds },
                          ...(periodDateFilter.gte ? { date: periodDateFilter } : {}),
                      },
                      _count: { _all: true },
                  })
                : Promise.resolve([] as Array<{ subjectId: string | null; _count: { _all: number } }>),
        ]);
        const registros = asistencia.reduce((n, f) => n + f._count._all, 0);
        const presentes = asistencia.filter((f) => f.status === 'PRESENT' || f.status === 'LATE').reduce((n, f) => n + f._count._all, 0);
        const attendance = registros > 0 ? Math.round((presentes * 100) / registros) : null;
        const obsDe = new Map(observaciones.map((o) => [o.subjectId, o._count._all]));

        const subjectsWithStats = classroomSubjects.map((cs) => {
            const deLaMateria = [...notas.values()].map((m) => m.get(cs.subjectId)).filter((n): n is number => typeof n === 'number');
            const average = deLaMateria.length > 0
                ? Math.round((deLaMateria.reduce((a, b) => a + b, 0) / deLaMateria.length) * 100) / 100
                : null;
            return {
                id: cs.subject.id,
                name: cs.subject.name,
                color: cs.subject.color,
                code: cs.subject.code,
                slug: cs.subject.slug,
                teacher: cs.teacher ? {
                    id: cs.teacher.id,
                    firstName: cs.teacher.firstName,
                    lastName: cs.teacher.lastName,
                    avatar: cs.teacher.avatar,
                } : null,
                hoursPerWeek: cs.hoursPerWeek || 0,
                weeklyBlocks: cs.weeklyBlocks || 0,
                stats: {
                    average,
                    attendance,
                    observations: obsDe.get(cs.subjectId) ?? 0,
                    atRiskStudents: deLaMateria.filter((n) => n < minPassing).length,
                },
            };
        });

        return reply.status(200).send({
            subjects: subjectsWithStats,
            total: subjectsWithStats.length,
        });
    } catch (error) {
        logger.error('Error al obtener estadísticas de materias', {
            error: error instanceof Error ? error.message : String(error),
            classroomId: request.params.classroomId,
        });
        return reply.status(500).send({
            error: 'Error al obtener estadísticas',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}
