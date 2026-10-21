import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../utils/prisma-enums';
import { AdminDashboardDto } from '../../dto/dashboard-response.dto';
import { getAcademicConfig } from '../promotion/configuracion-academica';
import { cifrasOficialesDelAno, estaEnRiesgo, mediaOficial } from '../cifras-oficiales.service';

/**
 * Dashboard para Administradores (IMPLEMENTADO)
 */
export async function inicioDelAdmin(db: PrismaClient, instituteId?: string): Promise<AdminDashboardDto> {
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
        select: { id: true, name: true, startDate: true, endDate: true }
    });
    // Las cifras oficiales del año, UNA vez: de aquí salen el riesgo y el
    // promedio del liceo (antes el promedio venía de las estadísticas del
    // ciclo, que lo recalculaban materia por materia: 31 s medidos con 200
    // personas en 50 liceos y una conexión por liceo).
    const cifrasDelAno = activeYear ? cifrasOficialesDelAno(db, instituteId, activeYear.id) : Promise.resolve([]);
    cifrasDelAno.catch(() => undefined);

    // TODAS las queries en paralelo (incluyendo activity y alerts, que antes eran secuenciales)
    const [
        totalStudents,
        totalTeachers,
        totalClassrooms,
        attendanceStats,
        studentsAtRisk,
        todayAttendance,
        gradeCapacity,
        eventsAndClosure,
        eventsCalendar,
        pendingActivities,
        recentActivity,
        alerts
    ] = await Promise.all([
        db.user.count({ where: { role: UserRole.STUDENT, isActive: true } }),
        db.user.count({ where: { role: UserRole.TEACHER, isActive: true } }),
        db.classroom.count({ where: { isActive: true } }),

        // Asistencia histórica de los últimos 30 días
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

        // Estudiantes en riesgo y radar de casos críticos (materias aplazadas < minPassing en el ciclo activo)
        (async () => {
            if (!activeYear) return { count: 0, top: [] as Array<{ id: string; name: string; classroomName: string; failedCount: number }> };
            // Con la cifra oficial (la de la boleta) y la misma regla de riesgo
            // que la sección y el año (`estaEnRiesgo`). Antes: la media a pelo
            // de la tabla de notas, y el Inicio decía 257 donde los años sumaban 149.
            const delAno = await cifrasDelAno;
            const uniqueStudents = new Set<string>();
            const failedMap = new Map<string, number>();
            for (const { oficiales } of delAno) {
                for (const [sid, c] of oficiales) {
                    const r = estaEnRiesgo(c, minPassing);
                    if (!r.enRiesgo) continue;
                    uniqueStudents.add(sid);
                    failedMap.set(sid, r.reprobadas);
                }
            }
            const sorted = Array.from(failedMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4);

            let top: Array<{ id: string; name: string; classroomName: string; failedCount: number }> = [];
            if (sorted.length > 0) {
                const students = await db.user.findMany({
                    where: { id: { in: sorted.map(s => s[0]) } },
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        studentClassrooms: {
                            where: { isActive: true },
                            select: { classroom: { select: { name: true } } },
                            take: 1
                        }
                    }
                });
                top = sorted.map(([sId, count]) => {
                    const st = students.find(s => s.id === sId);
                    const cName = st?.studentClassrooms?.[0]?.classroom?.name || 'Sección activa';
                    return {
                        id: sId,
                        name: st ? `${st.firstName} ${st.lastName}` : sId,
                        classroomName: cName,
                        failedCount: count
                    };
                });
            }

            return { count: uniqueStudents.size, top };
        })(),

        // Monitoreo de asistencia del día (o de la jornada más reciente si hoy aún no abre pases)
        (async () => {
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

            let grouped: Array<{ status: string; _count: { _all: number } }> = await (db.dailyAttendance as any).groupBy({
                by: ['status'],
                where: { date: { gte: startOfToday, lte: endOfToday } },
                _count: { _all: true }
            });
            let dateLabel = 'Hoy';

            let total = grouped.reduce((sum, g) => sum + g._count._all, 0);
            if (total === 0) {
                const lastRecord = await db.dailyAttendance.findFirst({
                    orderBy: { date: 'desc' },
                    select: { date: true }
                });
                if (lastRecord?.date) {
                    const d = lastRecord.date;
                    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
                    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
                    grouped = await (db.dailyAttendance as any).groupBy({
                        by: ['status'],
                        where: { date: { gte: start, lte: end } },
                        _count: { _all: true }
                    });
                    total = grouped.reduce((sum, g) => sum + g._count._all, 0);
                    dateLabel = 'Última jornada';
                }
            }

            const present = grouped.find(g => g.status === 'PRESENT')?._count._all || 0;
            const late = grouped.find(g => g.status === 'LATE')?._count._all || 0;
            const absent = grouped.find(g => g.status === 'ABSENT')?._count._all || 0;
            const excused = grouped.find(g => g.status === 'EXCUSED')?._count._all || 0;
            const effectivePresent = present + late;
            const percentage = total > 0 ? Math.round((effectivePresent * 100) / total) : 100;

            return {
                total,
                present: effectivePresent,
                absent,
                late,
                excused,
                percentage,
                dateLabel
            };
        })(),

        // Ocupación y Capacidad por año (1° a 5° año)
        (async () => {
            const classrooms = await db.classroom.findMany({
                where: {
                    isActive: true,
                    ...(activeYear ? { academicYearId: activeYear.id } : {})
                },
                select: {
                    grade: true,
                    capacity: true,
                    _count: {
                        select: { studentClassrooms: { where: { isActive: true } } }
                    }
                }
            });

            const gradeMap = new Map<number, { enrolled: number; capacity: number }>();
            for (let g = 1; g <= 5; g++) {
                gradeMap.set(g, { enrolled: 0, capacity: 0 });
            }

            for (const c of classrooms) {
                const g = c.grade;
                if (g >= 1 && g <= 5) {
                    const cur = gradeMap.get(g)!;
                    const enrolled = c._count.studentClassrooms;
                    const cap = c.capacity && c.capacity > 0 ? c.capacity : Math.max(35, enrolled);
                    cur.enrolled += enrolled;
                    cur.capacity += cap;
                }
            }

            return [1, 2, 3, 4, 5].map(g => {
                const item = gradeMap.get(g) || { enrolled: 0, capacity: 35 };
                const cap = item.capacity > 0 ? item.capacity : 35;
                const pct = Math.min(100, Math.round((item.enrolled * 100) / cap));
                return {
                    grade: g,
                    name: `${g}° Año`,
                    enrolled: item.enrolled,
                    capacity: cap,
                    percentage: pct
                };
            });
        })(),

        // Periodo en curso y eventos escolares
        (async () => {
            if (!activeYear) return { periodClosure: null, events: [] };
            const periods = await db.period.findMany({
                where: { academicYearId: activeYear.id },
                orderBy: { startDate: 'asc' },
                select: { id: true, name: true, startDate: true, endDate: true, isActive: true }
            });

            const now = new Date();
            const activePeriod = periods.find(p => p.isActive) ||
                periods.find(p => p.startDate <= now && now <= p.endDate) ||
                periods[0];

            let periodClosure: { periodName: string | null; daysLeft: number | null; endDate: string | null } | null = null;
            if (activePeriod?.endDate) {
                const diffMs = activePeriod.endDate.getTime() - now.getTime();
                const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                periodClosure = {
                    periodName: activePeriod.name,
                    daysLeft,
                    endDate: activePeriod.endDate.toISOString().split('T')[0]
                };
            }

            const rawEvents = await db.schoolEvent.findMany({
                where: {
                    date: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
                    academicYearId: activeYear.id
                },
                take: 3,
                orderBy: { date: 'asc' },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    date: true,
                    startTime: true,
                    endTime: true,
                    scope: true
                }
            });

            const events = rawEvents.map(e => ({
                id: e.id,
                title: e.title,
                description: e.description,
                date: e.date.toISOString().split('T')[0],
                startTime: e.startTime,
                endTime: e.endTime,
                scope: e.scope
            }));

            return { periodClosure, events };
        })(),

        // El cuadro de honor ya no se calcula aquí: sale de la foto del sábado
        // (`/api/cuadro-de-honor`, cuadro-de-honor.service.ts).

        // Calendario y actividades para el widget de agenda interactiva
        (async () => {
            if (!activeYear) return { currentPeriod: null, events: [] };
            const periods = await db.period.findMany({
                where: { academicYearId: activeYear.id },
                orderBy: { startDate: 'asc' },
                select: { id: true, name: true, startDate: true, endDate: true, isActive: true }
            });

            const now = new Date();
            const activePeriod = periods.find(p => p.isActive) ||
                periods.find(p => p.startDate <= now && now <= p.endDate) ||
                periods[0];

            let currentPeriod = null;
            if (activePeriod?.endDate) {
                const diffMs = activePeriod.endDate.getTime() - now.getTime();
                const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                currentPeriod = {
                    id: activePeriod.id,
                    name: activePeriod.name,
                    startDate: activePeriod.startDate.toISOString().split('T')[0],
                    endDate: activePeriod.endDate.toISOString().split('T')[0],
                    daysLeft
                };
            }

            // Eventos del ciclo escolar
            const startOfCycle = activeYear.startDate || new Date(now.getFullYear(), 0, 1);
            const rawEvents = await db.schoolEvent.findMany({
                where: {
                    academicYearId: activeYear.id,
                    date: { gte: startOfCycle }
                },
                orderBy: { date: 'asc' },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    date: true,
                    startTime: true,
                    endTime: true,
                    scope: true
                }
            });

            const events = rawEvents.map(e => ({
                id: e.id,
                title: e.title,
                description: e.description,
                date: e.date.toISOString().split('T')[0],
                startTime: e.startTime,
                endTime: e.endTime,
                scope: e.scope,
                isHoliday: e.scope === 'FERIADO' || e.title.toLowerCase().includes('feriado') || e.title.toLowerCase().includes('sin clases')
            }));

            return { currentPeriod, events };
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

    // El promedio del liceo: la media de sus años, cada año la de sus
    // secciones, cada sección la de sus alumnos (MAPA §0, `cycleAverage`).
    let promedioGeneral: number | null = null;
    try {
        const porGrado = new Map<number, number[]>();
        for (const { grade, oficiales } of await cifrasDelAno) {
            const xs = [...oficiales.values()].map((c) => c.definitivo).filter((n): n is number => n !== null);
            if (xs.length) porGrado.set(grade, [...(porGrado.get(grade) ?? []), mediaOficial(xs)!]);
        }
        const anos = [...porGrado.values()].map((secs) => mediaOficial(secs)!);
        promedioGeneral = anos.length ? mediaOficial(anos) : null;
    } catch {
        promedioGeneral = null;
    }

    return {
        kpis: {
            totalStudents,
            totalTeachers,
            totalClassrooms,
            activeAcademicYear: activeYear?.name || null
        },
        stats: {
            averageAttendance: Math.round(attendanceStats[0]?.avgAttendance || 0),
            studentsAtRisk: studentsAtRisk.count,
            pendingActivities,
            promedioGeneral
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
        })),
        todayAttendance,
        atRiskStudentsTop: studentsAtRisk.top,
        gradeCapacity,
        periodClosure: eventsAndClosure.periodClosure,
        upcomingEvents: eventsAndClosure.events,
        eventsCalendar
    };
}
