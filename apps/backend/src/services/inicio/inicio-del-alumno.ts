import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../utils/prisma-enums';
import { StudentDashboardDto } from '../../dto/dashboard-response.dto';
import { getAcademicConfig } from '../promotion/configuracion-academica';
import { platformPrisma } from '../../config/database';
import { comoFecha, ventanaDelLapsoYCiclo, porcentajeDeAsistencia, materiasDelAlumnoConPromedio } from './comun';
import { cifrasOficialesDeLaSeccion, notaOficial } from '../cifras-oficiales.service';

/**
 * Dashboard para Estudiantes (IMPLEMENTADO)
 */
export async function inicioDelAlumno(userId: string, db: PrismaClient, instituteId?: string): Promise<StudentDashboardDto> {
    const student = await db.user.findUnique({
        where: { id: userId, role: UserRole.STUDENT },
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
                            teacher: true,
                            academicYear: true
                        }
                    },
                    academicYear: true
                }
            }
        }
    });

    if (!student) {
        throw new Error('Estudiante no encontrado');
    }

    const activeClassroom = student.studentClassrooms?.[0]?.classroom || null;
    const activeClassroomId = student.studentClassrooms?.[0]?.classroomId || null;
    const anioActivoId = student.studentClassrooms?.[0]?.academicYearId || null;

    let resolvedInstituteId = instituteId;
    if (!resolvedInstituteId) {
        const inst = await platformPrisma.institute.findFirst({ select: { id: true } });
        resolvedInstituteId = inst?.id ?? '';
    }

    let minPassing = 10;
    if (resolvedInstituteId) {
        try {
            const config = await getAcademicConfig(resolvedInstituteId);
            minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
        } catch {
            minPassing = 10;
        }
    }

    // Asistencia y observaciones se miran POR LAPSO EN CURSO, y aparte por
    // ciclo. Antes se contaban desde siempre: un alumno de 5º año arrastraba
    // sus cinco años en el mismo porcentaje, así que el número no decía nada
    // del momento y además crecía el trabajo cada año que pasaba.
    const ventana = await ventanaDelLapsoYCiclo(db, anioActivoId);

    const [gradesStats, attendanceStats, observationsCount, periodData] = await Promise.all([
        // Con sección, sus materias salen de la cuenta oficial de abajo (las
        // que tienen nota): calcular aparte su promedio era hacer dos veces
        // el mismo trabajo en la pantalla que más se abre.
        activeClassroomId
            ? db.classroomSubject.findMany({
                  where: { classroomId: activeClassroomId },
                  select: { subject: { select: { id: true, name: true, color: true, evaluacion: true } } },
              }).then((xs: any[]) => xs.map((x) => ({
                  subjectId: x.subject.id,
                  subjectName: x.subject.name,
                  subjectColor: x.subject.color,
                  average: 0,
                  conNotas: false,
                  cualitativa: x.subject.evaluacion === 'CUALITATIVA',
                  deLaSeccion: true,
              })))
            : materiasDelAlumnoConPromedio(db, userId, activeClassroomId, ventana.lapsosDelCiclo),

        (async () => {
            const [lapso, ciclo] = await Promise.all([
                porcentajeDeAsistencia(db, userId, ventana.lapso),
                porcentajeDeAsistencia(db, userId, ventana.ciclo),
            ]);
            return [{ attendancePercentage: lapso, attendancePercentageCiclo: ciclo }];
        })(),

        (async () => {
            const [lapso, ciclo] = await Promise.all([
                db.observation.count({ where: { studentId: userId, ...comoFecha('date', ventana.lapso) } }),
                db.observation.count({ where: { studentId: userId, ...comoFecha('date', ventana.ciclo) } }),
            ]);
            return { lapso, ciclo };
        })(),

        (async () => {
            const periods = await db.period.findMany({
                where: { academicYear: { status: 'ACTIVE' } },
                orderBy: { startDate: 'asc' },
                select: { id: true, name: true },
            });
            // La cuenta oficial (la de la boleta), la misma de la ficha y la lista.
            const oficiales = activeClassroomId && resolvedInstituteId
                ? (await cifrasOficialesDeLaSeccion(db, resolvedInstituteId, activeClassroomId, [userId])).get(userId)
                : undefined;
            return { periods, oficiales };
        })()
    ]);

    const { periods, oficiales } = periodData;
    const periodAverages = periods.map((p: any) => ({
        periodId: p.id,
        periodName: p.name,
        average: oficiales?.porLapso[p.id] ?? 0,
    }));

    const subjects = (gradesStats && Array.isArray(gradesStats) && gradesStats.length > 0)
        ? gradesStats
            // Las de la sección, solo las que tienen nota (como antes: el
            // Inicio enseña las materias donde ya hay algo).
            .filter((s: any) => !s.deLaSeccion || (!s.cualitativa && notaOficial(oficiales, s.subjectId) !== null))
            .map(s => {
            const cualitativa = (s as any).cualitativa ?? false;
            const oficial = cualitativa ? null : notaOficial(oficiales, s.subjectId);
            return {
                id: s.subjectId,
                name: s.subjectName,
                average: oficial ?? 0,
                color: s.subjectColor || '#666',
                status: (oficial ?? 0) >= minPassing ? 'Aprobado' : 'Reprobado',
                hasGrades: oficial !== null,
                cualitativa,
            };
        })
        : [];

    // El promedio del Inicio es el de la boleta, la misma cuenta oficial.
    const globalAverage = oficiales?.definitivo ?? 0;

    const failedSubjects = subjects.filter(s => !s.cualitativa && s.hasGrades && s.average < minPassing).length;

    const upcomingActivities = activeClassroomId ? await db.activity.findMany({
        where: { dueDate: { gte: new Date() }, isActive: true, classroomId: activeClassroomId },
        take: 5,
        orderBy: { dueDate: 'asc' },
        select: {
            id: true, title: true, dueDate: true, type: true,
            subject: { select: { name: true } }
        }
    }) : [];

    const recentObservations = await db.observation.findMany({
        where: { studentId: userId },
        take: 3,
        orderBy: { date: 'desc' },
        select: { id: true, title: true, type: true, date: true }
    });

    return {
        student: {
            id: student.id,
            fullName: `${student.firstName} ${student.lastName}`,
            avatar: student.avatar,
            currentSection: activeClassroom ? {
                id: activeClassroom.id,
                name: `${activeClassroom.grade}° ${activeClassroom.section}`,
                academicYearName: student.studentClassrooms?.[0]?.academicYear?.name || activeClassroom.academicYear?.name || null,
                academicYearId: student.studentClassrooms?.[0]?.academicYearId || activeClassroom.academicYear?.id || null,
                guideTeacher: activeClassroom.teacher
                    ? `${activeClassroom.teacher.firstName} ${activeClassroom.teacher.lastName}`
                    : null
            } : null
        },
        kpis: {
            globalAverage,
            failedSubjects,
            attendancePercentage: Math.round(attendanceStats[0]?.attendancePercentage || 0),
            attendancePercentageCiclo: Math.round(attendanceStats[0]?.attendancePercentageCiclo || 0),
            totalObservations: (observationsCount as any)?.lapso ?? 0,
            totalObservationsCiclo: (observationsCount as any)?.ciclo ?? 0
        },
        subjects,
        periodAverages,
        upcomingActivities: upcomingActivities.map(a => ({
            id: a.id,
            title: a.title,
            subject: a.subject?.name || 'N/A',
            dueDate: a.dueDate?.toISOString() || '',
            type: a.type
        })),
        recentObservations: recentObservations.map(o => ({
            id: o.id, title: o.title, type: o.type,
            date: o.date.toISOString().split('T')[0]
        }))
    };
}
