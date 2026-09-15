import { PrismaClient } from '@prisma/client';
import { UserRole } from '../utils/prisma-enums';
import { gradesService } from './grades.service';
import { AdminDashboardDto, TeacherDashboardDto, StudentDashboardDto, TutorDashboardDto } from '../dto/dashboard-response.dto';
import { getAcademicConfig, DEFAULT_ACADEMIC_CONFIG } from './promotion/close-cycle.service';

/**
 * QUÉ PERIODO SE MIRA: EL LAPSO EN CURSO, Y APARTE EL CICLO
 *
 * La asistencia y las observaciones se contaban **desde siempre**. Un alumno de
 * quinto año arrastraba sus cinco años en el mismo porcentaje: el número no
 * decía nada de cómo va ahora, y encima el trabajo crecía cada año que pasaba.
 *
 * Ahora se mira el lapso en curso —que es lo que le importa a un liceo— y se
 * ofrece aparte la cifra del ciclo completo.
 *
 * **Nada se deja de guardar.** Los años anteriores siguen enteros en la base y
 * en el expediente del alumno; lo único que cambia es qué se suma en el panel de
 * hoy.
 */
interface Ventana {
    desde?: Date;
    hasta?: Date;
}

interface VentanaDelAlumno {
    /** El lapso que corre hoy. Si no se puede saber, cae al ciclo. */
    lapso: Ventana;
    /** El ciclo escolar completo. */
    ciclo: Ventana;
    /** Los lapsos del ciclo, para acotar lo que se guarda por `periodId`. */
    lapsosDelCiclo: string[];
}

/** Convierte una ventana en un filtro de Prisma sobre el campo de fecha que sea. */
function comoFecha(campo: string, v: Ventana): Record<string, unknown> {
    if (!v?.desde && !v?.hasta) return {};
    const rango: Record<string, Date> = {};
    if (v.desde) rango.gte = v.desde;
    if (v.hasta) rango.lte = v.hasta;
    return { [campo]: rango };
}

/**
 * Busca el lapso que contiene el día de hoy dentro del ciclo del alumno.
 *
 * Si ninguno lo contiene (vacaciones, por ejemplo) se usa el último que ya
 * empezó; y si tampoco hay, se usa el ciclo entero. Nunca devuelve vacío: una
 * ventana sin límites contaría desde siempre, que es justo lo que se corrige.
 */
async function ventanaDelLapsoYCiclo(db: any, academicYearId: string | null): Promise<VentanaDelAlumno> {
    if (!academicYearId) return { lapso: {}, ciclo: {}, lapsosDelCiclo: [] };

    const anio = await db.academicYear.findUnique({
        where: { id: academicYearId },
        select: {
            startDate: true,
            endDate: true,
            periods: { select: { id: true, startDate: true, endDate: true }, orderBy: { startDate: 'asc' } },
        },
    });
    if (!anio) return { lapso: {}, ciclo: {}, lapsosDelCiclo: [] };

    const ciclo: Ventana = { desde: anio.startDate ?? undefined, hasta: anio.endDate ?? undefined };
    const lapsosDelCiclo: string[] = (anio.periods || []).map((p: any) => p.id).filter(Boolean);
    const hoy = new Date();

    const enCurso = (anio.periods || []).find(
        (p: any) => p.startDate && p.endDate && p.startDate <= hoy && hoy <= p.endDate
    );
    if (enCurso) return { lapso: { desde: enCurso.startDate, hasta: enCurso.endDate }, ciclo, lapsosDelCiclo };

    const yaEmpezados = (anio.periods || []).filter((p: any) => p.startDate && p.startDate <= hoy);
    const ultimo = yaEmpezados[yaEmpezados.length - 1];
    if (ultimo) return { lapso: { desde: ultimo.startDate, hasta: ultimo.endDate ?? undefined }, ciclo, lapsosDelCiclo };

    return { lapso: ciclo, ciclo, lapsosDelCiclo };
}

/** Porcentaje de asistencia de un alumno dentro de una ventana de fechas. */
async function porcentajeDeAsistencia(db: any, studentId: string, v: Ventana): Promise<number> {
    const donde = { studentId, ...comoFecha('date', v) };
    const [total, presentes] = await Promise.all([
        db.dailyAttendance.count({ where: donde }),
        db.dailyAttendance.count({ where: { ...donde, status: { in: ['PRESENT', 'LATE'] } } }),
    ]);
    return total > 0 ? (presentes * 100.0) / total : 0;
}


export class DashboardService {
    /**
     * Dashboard para Administradores (IMPLEMENTADO)
     */
    async getAdminDashboard(db: PrismaClient, instituteId?: string): Promise<AdminDashboardDto> {
        let minPassing = 10;
        if (instituteId) {
            try {
                const config = await getAcademicConfig(instituteId);
                minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
            } catch {
                minPassing = 10;
            }
        }
        const activeYear = await db.academicYear.findFirst({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true }
        });

        // TODAS las queries en paralelo (incluyendo activity y alerts, que antes eran secuenciales)
        const [
            totalStudents,
            totalTeachers,
            totalClassrooms,
            attendanceStats,
            studentsAtRisk,
            pendingActivities,
            recentActivity,
            alerts
        ] = await Promise.all([
            db.user.count({ where: { role: UserRole.STUDENT, isActive: true } }),
            db.user.count({ where: { role: UserRole.TEACHER, isActive: true } }),
            db.classroom.count({ where: { isActive: true } }),

            // Asistencia: UN solo groupBy por status en vez de dos counts separados
            (async () => {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const grouped = await db.dailyAttendance.groupBy({
                    by: ['status'],
                    where: { date: { gte: thirtyDaysAgo } },
                    _count: { _all: true }
                });
                const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
                const present = grouped
                    .filter(g => g.status === 'PRESENT' || g.status === 'LATE')
                    .reduce((sum, g) => sum + g._count._all, 0);
                return [{ avgAttendance: total > 0 ? (present * 100.0) / total : 0 }];
            })(),

            // Estudiantes en riesgo: consistente con la vista de Ciclo Escolar (materias aplazadas < minPassing en el ciclo activo)
            (async () => {
                if (!activeYear) return [{ count: 0 }];
                const studentSubjectAverages = await db.grade.groupBy({
                    by: ['studentId', 'subjectId'],
                    where: {
                        period: { academicYearId: activeYear.id },
                        score: { not: null }
                    },
                    _avg: { score: true },
                    having: {
                        score: { _avg: { lt: minPassing } }
                    }
                });
                const uniqueStudents = new Set(studentSubjectAverages.map(s => s.studentId));
                return [{ count: uniqueStudents.size }];
            })(),

            db.activity.count({
                where: { dueDate: { gte: new Date() }, isActive: true }
            }),

            db.auditLog.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, action: true, entity: true, createdAt: true,
                    user: { select: { firstName: true, lastName: true } }
                }
            }),

            db.systemAlert.findMany({
                where: { resolved: false },
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: { id: true, type: true, severity: true, message: true, createdAt: true }
            })
        ]);

        return {
            kpis: {
                totalStudents,
                totalTeachers,
                totalClassrooms,
                activeAcademicYear: activeYear?.name || null
            },
            stats: {
                averageAttendance: Math.round(attendanceStats[0]?.avgAttendance || 0),
                studentsAtRisk: studentsAtRisk[0]?.count || 0,
                pendingActivities
            },
            recentActivity: recentActivity.map(a => ({
                id: a.id,
                action: a.action,
                entity: a.entity,
                timestamp: a.createdAt.toISOString(),
                user: a.user ? `${a.user.firstName} ${a.user.lastName}` : null
            })),
            alerts: alerts.map(a => ({
                id: a.id,
                type: a.type,
                severity: a.severity,
                message: a.message,
                createdAt: a.createdAt.toISOString()
            }))
        };
    }

    /**
     * Dashboard para Profesores (IMPLEMENTADO)
     */
    async getTeacherDashboard(userId: string, db: PrismaClient): Promise<TeacherDashboardDto> {
        const teacher = await db.user.findUnique({
            where: { id: userId },
            select: { id: true, firstName: true, lastName: true, specialization: true }
        });

        if (!teacher) throw new Error('Profesor no encontrado');

        const classrooms = await db.classroom.findMany({
            where: {
                OR: [
                    { teacherId: userId },
                    { teachers: { some: { teacherId: userId } } }
                ],
                isActive: true
            },
            select: {
                id: true, name: true, grade: true, section: true,
                _count: { select: { studentClassrooms: { where: { isActive: true } } } }
            }
        });

        const upcomingActivities = await db.activity.findMany({
            where: { createdBy: userId, dueDate: { gte: new Date() }, isActive: true },
            take: 5,
            orderBy: { dueDate: 'asc' },
            select: {
                id: true, title: true, type: true, dueDate: true,
                classroom: { select: { name: true } },
                subject: { select: { name: true } }
            }
        });

        const pendingGrades = await db.activity.count({
            where: { createdBy: userId, isActive: true, grades: { none: {} } }
        });

        const totalStudents = classrooms.reduce((sum, c) => sum + (c._count?.studentClassrooms || 0), 0);

        return {
            teacher: { id: teacher.id, fullName: `${teacher.firstName} ${teacher.lastName}`, specialization: teacher.specialization },
            classrooms: classrooms.map(c => ({ id: c.id, name: c.name, grade: c.grade, section: c.section, studentCount: c._count?.studentClassrooms || 0 })),
            upcomingActivities: upcomingActivities.map(a => ({
                id: a.id, title: a.title, type: a.type,
                dueDate: a.dueDate?.toISOString() || '',
                classroom: a.classroom?.name || 'N/A',
                subject: a.subject?.name || 'N/A'
            })),
            stats: { totalStudents, totalClassrooms: classrooms.length, pendingGrades }
        };
    }

    /**
     * Dashboard para Estudiantes (IMPLEMENTADO)
     */
    async getStudentDashboard(userId: string, db: PrismaClient, instituteId?: string): Promise<StudentDashboardDto> {
        let minPassing = 10;
        if (instituteId) {
            try {
                const config = await getAcademicConfig(instituteId);
                minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
            } catch {
                minPassing = 10;
            }
        }

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

        // Asistencia y observaciones se miran POR LAPSO EN CURSO, y aparte por
        // ciclo. Antes se contaban desde siempre: un alumno de 5º año arrastraba
        // sus cinco años en el mismo porcentaje, así que el número no decía nada
        // del momento y además crecía el trabajo cada año que pasaba.
        const ventana = await ventanaDelLapsoYCiclo(db, anioActivoId);

        const [gradesStats, attendanceStats, observationsCount, periodAverages] = await Promise.all([
            (async () => {
                // Solo las materias DE ESTE CICLO.
                //
                // Antes se sacaban las de todo su historial. Una materia de un año
                // anterior se colaba en el panel de hoy con promedio 0, y ese 0
                // parece un aplazado cuando en realidad significa "esta materia no
                // es de este año". No se pierde nada: los años anteriores siguen
                // enteros en la base y en el expediente del alumno.
                const grades = await db.grade.groupBy({
                    by: ['subjectId'],
                    where: {
                        studentId: userId,
                        ...(ventana.lapsosDelCiclo.length > 0
                            ? { periodId: { in: ventana.lapsosDelCiclo } }
                            : {}),
                    },
                    _avg: { score: true }
                });
                const classActs = activeClassroomId
                    ? await db.classActivity.findMany({
                        where: { classroomId: activeClassroomId, scores: { not: undefined } },
                        select: { subjectId: true, scores: true },
                    })
                    : [];
                const classActSubjectIds = new Set<string>();
                classActs.forEach(act => {
                    let parsed: Record<string, number | null> = {};
                    try {
                        parsed = typeof act.scores === 'string' ? JSON.parse(act.scores) : (act.scores || {});
                    } catch { /* ignorar */ }
                    if (parsed[userId] !== null && parsed[userId] !== undefined) classActSubjectIds.add(act.subjectId);
                });

                const subjectIds = [...new Set([...grades.map((g: any) => g.subjectId), ...classActSubjectIds])];
                const subjects = await db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true, color: true } });
                return Promise.all(subjects.map(async (s: any) => {
                    // Se le pasan los lapsos ya sabidos: sin esto, cada materia
                    // repetía la misma consulta para averiguarlos.
                    const level2 = await gradesService.calculateWeightedSubjectAverage(
                        db as PrismaClient,
                        userId,
                        s.id,
                        undefined,
                        ventana.lapsosDelCiclo
                    );
                    return { subjectId: s.id, subjectName: s.name, subjectColor: s.color || '#666', average: level2 };
                }));
            })(),

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
                    orderBy: { startDate: 'asc' }
                });

                /**
                 * EL PROMEDIO DEL LAPSO SE HACE POR MATERIA, NO POR NOTA
                 *
                 * Aquí se recorrían **las filas de notas**: por cada nota del
                 * alumno se pedía el promedio de esa materia en ese lapso y se
                 * metía en la lista. O sea, una materia con cinco notas metía
                 * cinco veces el MISMO número, y una con dos, dos veces. Al
                 * hacer la media de esa lista, las materias con más
                 * evaluaciones pesaban más que las demás.
                 *
                 * El promedio del lapso que ve el alumno salía mal, sin más. La
                 * regla está escrita en `docs/MAPA_DE_CALCULOS.md`: cada nivel
                 * es la media de las **entidades** del nivel de abajo —una
                 * materia, una vez—, no de sus filas.
                 *
                 * De paso: se pedían las notas de TODOS los años del alumno y
                 * se calculaba una por una, para tirar después las que no eran
                 * de este año. Ahora se piden solo las del año activo y se
                 * calcula una vez por materia y lapso, en paralelo.
                 */
                const idsDeLapsos = periods.map(p => p.id);
                const gradesByPeriod = idsDeLapsos.length === 0 ? [] : await db.grade.findMany({
                    where: { studentId: userId, periodId: { in: idsDeLapsos } },
                    select: { periodId: true, subjectId: true }
                });

                const pares = new Map<string, { periodId: string; subjectId: string }>();
                for (const g of gradesByPeriod) {
                    pares.set(`${g.periodId}|${g.subjectId}`, { periodId: g.periodId, subjectId: g.subjectId });
                }

                const avgByPeriod = new Map<string, number[]>();
                const calculados = await Promise.all(
                    [...pares.values()].map(async (par) => ({
                        periodId: par.periodId,
                        promedio: await gradesService.calculateWeightedSubjectAverage(
                            db as PrismaClient, userId, par.subjectId, par.periodId
                        ),
                    }))
                );
                for (const c of calculados) {
                    if (c.promedio > 0) {
                        if (!avgByPeriod.has(c.periodId)) avgByPeriod.set(c.periodId, []);
                        avgByPeriod.get(c.periodId)!.push(c.promedio);
                    }
                }

                return periods.map(p => {
                    const grades = avgByPeriod.get(p.id) || [];
                    const average = grades.length > 0
                        ? grades.reduce((a, b) => a + b, 0) / grades.length
                        : 0;
                    return { periodId: p.id, periodName: p.name, average: Math.round(average * 10) / 10 };
                });
            })()
        ]);

        const subjects = (gradesStats && Array.isArray(gradesStats) && gradesStats.length > 0)
            ? gradesStats.map(s => ({
                id: s.subjectId,
                name: s.subjectName,
                average: parseFloat(Number(s.average || 0).toFixed(1)),
                color: s.subjectColor || '#666',
                status: (s.average || 0) >= minPassing ? 'Aprobado' : 'Reprobado'
            }))
            : [];

        const validSubjects = subjects.filter((s: any) => s.average > 0);
        const globalAverage = validSubjects.length > 0
            ? Math.round((validSubjects.reduce((acc: number, s: any) => acc + s.average, 0) / validSubjects.length) * 10) / 10
            : 0;

        const failedSubjects = subjects.filter(s => s.average > 0 && s.average < minPassing).length;

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

    /**
     * Dashboard para Tutores (IMPLEMENTADO)
     */
    async getTutorDashboard(userId: string, db: PrismaClient, instituteId?: string): Promise<TutorDashboardDto> {
        let minPassing = 10;
        // Desde qué porcentaje se le avisa al representante. Lo pone el liceo;
        // 80 es solo el punto de partida. Ver `AcademicConfig.asistenciaMinima`.
        let asistenciaMinima = DEFAULT_ACADEMIC_CONFIG.asistenciaMinima;
        if (instituteId) {
            try {
                const config = await getAcademicConfig(instituteId);
                minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
                asistenciaMinima = config.asistenciaMinima;
            } catch {
                minPassing = 10;
            }
        }

        const tutor = await db.user.findUnique({
            where: { id: userId },
            include: {
                children: {
                    include: {
                        student: {
                            select: {
                                id: true, firstName: true, lastName: true, avatar: true,
                                studentClassrooms: {
                                    where: { isActive: true },
                                    take: 1,
                                    select: {
                                        // Hace falta para acotar al lapso y al ciclo en curso.
                                        // Sin este campo, el filtro de más abajo se queda vacío
                                        // y se vuelve a contar toda la vida escolar — en silencio.
                                        academicYearId: true,
                                        classroom: { select: { grade: true, section: true } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!tutor) throw new Error('Tutor no encontrado');

        const childrenWithStats = await Promise.all(
            tutor.children.map(async (child: any) => {
                // El representante ve cómo va su hijo AHORA: lapso en curso para la
                // asistencia, ciclo en curso para el promedio. Antes se sumaba toda
                // la vida escolar del alumno, así que un quinto año arrastraba sus
                // cinco años y el número no servía para decidir nada.
                const ventanaHijo = await ventanaDelLapsoYCiclo(
                    db,
                    child.student.studentClassrooms?.[0]?.academicYearId ?? null
                );

                const [stats] = await (async () => {
                    const [gradeAgg, asistencia] = await Promise.all([
                        db.grade.aggregate({
                            where: {
                                studentId: child.student.id,
                                ...(ventanaHijo.lapsosDelCiclo.length > 0
                                    ? { periodId: { in: ventanaHijo.lapsosDelCiclo } }
                                    : {}),
                            },
                            _avg: { score: true },
                        }),
                        porcentajeDeAsistencia(db, child.student.id, ventanaHijo.lapso),
                    ]);
                    return [{
                        average: gradeAgg._avg.score ?? 0,
                        attendancePercentage: asistencia,
                    }];
                })();

                const childClassroom = child.student.studentClassrooms?.[0]?.classroom;

                return {
                    id: child.student.id,
                    fullName: `${child.student.firstName} ${child.student.lastName}`,
                    avatar: child.student.avatar,
                    classroom: childClassroom
                        ? `${childClassroom.grade}° ${childClassroom.section}`
                        : null,
                    average: parseFloat(Number(stats?.average || 0).toFixed(1)),
                    attendancePercentage: Math.round(Number(stats?.attendancePercentage || 0)),
                    relationship: child.relationship
                };
            })
        );

        const alerts = childrenWithStats
            .filter(c => (c.average > 0 && c.average < minPassing) || c.attendancePercentage < asistenciaMinima)
            .map(c => ({
                studentId: c.id,
                studentName: c.fullName,
                type: (c.average > 0 && c.average < minPassing) ? 'ACADEMIC' : 'ATTENDANCE',
                message: (c.average > 0 && c.average < minPassing)
                    ? `Promedio bajo: ${c.average}`
                    : `Asistencia baja: ${c.attendancePercentage}%`,
                date: new Date().toISOString()
            }));

        return {
            tutor: { id: tutor.id, fullName: `${tutor.firstName} ${tutor.lastName}` },
            children: childrenWithStats,
            alerts
        };
    }

    async getSystemStats(db: PrismaClient) {
        return db.auditLog.aggregate({ _count: { id: true } });
    }

    async getInstituteStats(db: PrismaClient) {
        return db.activity.aggregate({ _count: { id: true } });
    }

    async getRecentActivity(userId: string, db: PrismaClient) {
        return db.auditLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
    }

    async getUpcomingEvents(userId: string, db: PrismaClient) {
        return db.activity.findMany({
            where: { dueDate: { gt: new Date() } },
            orderBy: { dueDate: 'asc' },
            take: 5
        });
    }

    async getPerformanceMetrics(userId: string, db: PrismaClient) {
        // Lógica para calcular métricas de rendimiento
    }
}
