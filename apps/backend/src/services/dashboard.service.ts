import { PrismaClient } from '@prisma/client';
import { UserRole } from '../utils/prisma-enums';
import { gradesService } from './grades.service';
import { AdminDashboardDto, TeacherDashboardDto, StudentDashboardDto, TutorDashboardDto } from '../dto/dashboard-response.dto';

export class DashboardService {
    /**
     * Dashboard para Administradores (IMPLEMENTADO)
     */
    async getAdminDashboard(db: PrismaClient): Promise<AdminDashboardDto> {
        // TODAS las queries en paralelo (incluyendo activity y alerts, que antes eran secuenciales)
        const [
            activeYear,
            totalStudents,
            totalTeachers,
            totalClassrooms,
            attendanceStats,
            studentsAtRisk,
            pendingActivities,
            recentActivity,
            alerts
        ] = await Promise.all([
            db.academicYear.findFirst({
                where: { status: 'ACTIVE' },
                select: { id: true, name: true }
            }),

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

            (async () => {
                const gradesGrouped = await db.grade.groupBy({
                    by: ['studentId'],
                    _avg: { score: true },
                    having: { score: { _avg: { lt: 10 } } }
                });
                return [{ count: gradesGrouped.length }];
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
                _count: { select: { students: true } }
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

        const totalStudents = classrooms.reduce((sum, c) => sum + c._count.students, 0);

        return {
            teacher: { id: teacher.id, fullName: `${teacher.firstName} ${teacher.lastName}`, specialization: teacher.specialization },
            classrooms: classrooms.map(c => ({ id: c.id, name: c.name, grade: c.grade, section: c.section, studentCount: c._count.students })),
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
    async getStudentDashboard(userId: string, db: PrismaClient): Promise<StudentDashboardDto> {
        const student = await db.user.findUnique({
            where: { id: userId },
            select: {
                id: true, firstName: true, lastName: true, avatar: true,
                classroom: {
                    select: {
                        id: true, grade: true, section: true,
                        teacher: { select: { firstName: true, lastName: true } }
                    }
                }
            }
        });

        if (!student) throw new Error('Estudiante no encontrado');

        const [gradesStats, attendanceStats, observationsCount, periodAverages] = await Promise.all([
            (async () => {
                // CORRECCIÓN (jerarquía): el promedio por materia del estudiante es
                // NIVEL 2 (criterios ponderados + notas de Clase en Vivo). Antes:
                // AVG(score) simple sobre la tabla grades — que además era la ÚNICA
                // fuente de materias: una estudiante con notas SOLO en
                // ClassActivity.scores salía con 0 materias y promedio 0.
                const grades = await db.grade.groupBy({
                    by: ['subjectId'],
                    where: { studentId: userId },
                    _avg: { score: true }
                });
                const student = await db.user.findUnique({
                    where: { id: userId },
                    select: { classroomId: true },
                });
                const classActs = student?.classroomId
                    ? await db.classActivity.findMany({
                        where: { classroomId: student.classroomId, scores: { not: undefined } },
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
                    const level2 = await gradesService.calculateWeightedSubjectAverage(db as PrismaClient, userId, s.id);
                    return { subjectId: s.id, subjectName: s.name, subjectColor: s.color || '#666', average: level2 };
                }));
            })(),

            (async () => {
                const total = await db.dailyAttendance.count({ where: { studentId: userId } });
                const present = await db.dailyAttendance.count({ where: { studentId: userId, status: { in: ['PRESENT', 'LATE'] } } });
                return [{ attendancePercentage: total > 0 ? (present * 100.0) / total : 0 }];
            })(),

            db.observation.count({ where: { studentId: userId } }),

            // Promedio real por lapso (para el gráfico de evolución del estudiante)
            // CORRECCIÓN: por cada (periodo, materia) se usa el NIVEL 2 con el
            // lapso explícito; la nota del periodo = promedio de materias con nota
            // en ese lapso (antes: AVG simple por periodo).
            (async () => {
                const grouped = await db.grade.groupBy({
                    by: ['periodId', 'subjectId'],
                    where: { studentId: userId },
                    _count: { _all: true }
                });
                if (grouped.length === 0) return [];

                const periods = await db.period.findMany({
                    where: { id: { in: [...new Set(grouped.map(g => g.periodId))] } },
                    select: { id: true, name: true, startDate: true }
                });

                const avgByPeriod = new Map<string, number[]>();
                for (const g of grouped) {
                    const n2 = await gradesService.calculateWeightedSubjectAverage(
                        db as PrismaClient, userId, g.subjectId, g.periodId
                    );
                    if (n2 > 0) {
                        const list = avgByPeriod.get(g.periodId) || [];
                        list.push(n2);
                        avgByPeriod.set(g.periodId, list);
                    }
                }

                const results = [...avgByPeriod.entries()].map(([periodId, avgs]) => {
                    const p = periods.find(pp => pp.id === periodId);
                    const average = avgs.reduce((a, b) => a + b, 0) / avgs.length;
                    return {
                        periodId,
                        periodName: p?.name || 'Lapso',
                        startDate: p?.startDate?.getTime() ?? 0,
                        average: parseFloat(average.toFixed(1))
                    };
                });
                return results.sort((a, b) => a.startDate - b.startDate)
                    .map(({ periodId, periodName, average }) => ({ periodId, periodName, average }));
            })()
        ]);

        const subjects = (gradesStats && Array.isArray(gradesStats) && gradesStats.length > 0)
            ? gradesStats.map(s => ({
                id: s.subjectId,
                name: s.subjectName,
                average: parseFloat(Number(s.average || 0).toFixed(1)),
                color: s.subjectColor || '#666',
                status: (s.average || 0) >= 10 ? 'Aprobado' : 'Reprobado'
            }))
            : [];

        const globalAverage = subjects.length > 0
            ? parseFloat((subjects.reduce((sum, s) => sum + (s.average || 0), 0) / subjects.length).toFixed(1))
            : 0;

        const failedSubjects = subjects.filter(s => s.average < 10).length;

        const upcomingActivities = student.classroom?.id ? await db.activity.findMany({
            where: { dueDate: { gte: new Date() }, isActive: true, classroomId: student.classroom.id },
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
                currentSection: student.classroom ? {
                    id: student.classroom.id,
                    name: `${student.classroom.grade}° ${student.classroom.section}`,
                    guideTeacher: student.classroom.teacher
                        ? `${student.classroom.teacher.firstName} ${student.classroom.teacher.lastName}`
                        : null
                } : null
            },
            kpis: {
                globalAverage,
                failedSubjects,
                attendancePercentage: Math.round(attendanceStats[0]?.attendancePercentage || 0),
                totalObservations: observationsCount
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
    async getTutorDashboard(userId: string, db: PrismaClient): Promise<TutorDashboardDto> {
        const tutor = await db.user.findUnique({
            where: { id: userId },
            select: {
                id: true, firstName: true, lastName: true,
                children: {
                    select: {
                        relationship: true,
                        student: {
                            select: {
                                id: true, firstName: true, lastName: true, avatar: true,
                                classroom: { select: { grade: true, section: true } }
                            }
                        }
                    }
                }
            }
        });

        if (!tutor) throw new Error('Tutor no encontrado');

        const childrenWithStats = await Promise.all(
            tutor.children.map(async (child) => {
                const [stats] = await (async () => {
                    const [gradeAgg, totalAtt, presentAtt] = await Promise.all([
                        db.grade.aggregate({ where: { studentId: child.student.id }, _avg: { score: true } }),
                        db.dailyAttendance.count({ where: { studentId: child.student.id } }),
                        db.dailyAttendance.count({ where: { studentId: child.student.id, status: { in: ['PRESENT', 'LATE'] } } })
                    ]);
                    return [{
                        average: gradeAgg._avg.score ?? 0,
                        attendancePercentage: totalAtt > 0 ? (presentAtt * 100.0) / totalAtt : 0
                    }];
                })();

                return {
                    id: child.student.id,
                    fullName: `${child.student.firstName} ${child.student.lastName}`,
                    avatar: child.student.avatar,
                    classroom: child.student.classroom
                        ? `${child.student.classroom.grade}° ${child.student.classroom.section}`
                        : null,
                    average: parseFloat(Number(stats?.average || 0).toFixed(1)),
                    attendancePercentage: Math.round(Number(stats?.attendancePercentage || 0)),
                    relationship: child.relationship
                };
            })
        );

        const alerts = childrenWithStats
            .filter(c => c.average < 10 || c.attendancePercentage < 80)
            .map(c => ({
                studentId: c.id,
                studentName: c.fullName,
                type: c.average < 10 ? 'ACADEMIC' : 'ATTENDANCE',
                message: c.average < 10
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
