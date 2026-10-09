import { PrismaClient } from '@prisma/client';
import { UserRole } from '../utils/prisma-enums';
import { gradesService } from './grades.service';
import { AdminDashboardDto, TeacherDashboardDto, StudentDashboardDto, TutorDashboardDto } from '../dto/dashboard-response.dto';
import { getAcademicConfig, DEFAULT_ACADEMIC_CONFIG } from './promotion/close-cycle.service';
import { bulkSubjectAveragesConDatos } from './bulk-averages.service';
import { NOTAS_QUE_CUENTAN } from './apreciaciones.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { platformPrisma } from '../config/database';
import { boletaDelAlumno, BoletaDelAlumno, calcularPromedioBoletaDesdeLapsos } from './boleta.service';

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

/** Porcentaje de asistencia en una ventana, y cuántos registros hay (0 = no hay dato que juzgar). */
async function asistenciaEnLaVentana(db: any, studentId: string, v: Ventana): Promise<{ porcentaje: number; registros: number }> {
    const donde = { studentId, ...comoFecha('date', v) };
    const [total, presentes] = await Promise.all([
        db.dailyAttendance.count({ where: donde }),
        db.dailyAttendance.count({ where: { ...donde, status: { in: ['PRESENT', 'LATE'] } } }),
    ]);
    return { porcentaje: total > 0 ? (presentes * 100.0) / total : 0, registros: total };
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


/**
 * Las materias del alumno en el ciclo, con su promedio (nivel 2) y si tiene
 * notas. Es EL cálculo del panel del alumno, y el del representante usa el
 * mismo: antes el representante veía la media a pelo de la tabla de notas
 * antigua —sin las de Clase en Vivo ni el plan— y le salía 0 a un hijo que iba
 * con 8 (REP-01).
 */
async function materiasDelAlumnoConPromedio(
    db: any,
    userId: string,
    activeClassroomId: string | null,
    lapsosDelCiclo: string[]
): Promise<Array<{ subjectId: string; subjectName: string; subjectColor: string; average: number; conNotas: boolean }>> {
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
            ...NOTAS_QUE_CUENTAN,
            ...(lapsosDelCiclo.length > 0
                ? { periodId: { in: lapsosDelCiclo } }
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
    classActs.forEach((act: any) => {
        let parsed: Record<string, number | null> = {};
        try {
            parsed = typeof act.scores === 'string' ? JSON.parse(act.scores) : (act.scores || {});
        } catch { /* ignorar */ }
        if (parsed[userId] !== null && parsed[userId] !== undefined) classActSubjectIds.add(act.subjectId);
    });

    const subjectIds = [...new Set([...grades.map((g: any) => g.subjectId), ...classActSubjectIds])];
    const subjects = await db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true, color: true, evaluacion: true } });

    /**
     * EN BLOQUE: EL MISMO NÚMERO, CON 4 CONSULTAS EN VEZ DE ~20 POR MATERIA
     *
     * Materia por materia, este panel —el que más se abre del
     * sistema— hacía unas 180 consultas en un alumno normal, y
     * crecía con cada materia. Con 500 personas a la vez su p99
     * llegó a 13 s. `bulkSubjectAverages` aplica las mismas reglas
     * (lo comprueba PANEL-02 contra el cálculo de siempre).
     */
    if (activeClassroomId && subjects.length > 0) {
        const enBloque = await bulkSubjectAveragesConDatos(db, {
            classroomId: activeClassroomId,
            studentIds: [userId],
            subjectIds: subjects.map((s: any) => s.id),
        });
        const suyos = enBloque.get(userId);
        return subjects.map((s: any) => ({
            subjectId: s.id,
            subjectName: s.name,
            subjectColor: s.color || '#666',
            average: suyos?.get(s.id)?.promedio ?? 0,
            conNotas: suyos?.get(s.id)?.conNotas ?? false,
            cualitativa: s.evaluacion === 'CUALITATIVA',
        }));
    }

    return Promise.all(subjects.map(async (s: any) => {
        // Se le pasan los lapsos ya sabidos: sin esto, cada materia
        // repetía la misma consulta para averiguarlos.
        const level2 = await gradesService.promedioDeLaMateria(
            db as PrismaClient,
            userId,
            s.id,
            undefined,
            lapsosDelCiclo
        );
        return {
            subjectId: s.id,
            subjectName: s.name,
            subjectColor: s.color || '#666',
            average: level2.promedio,
            conNotas: level2.conNotas,
            cualitativa: s.evaluacion === 'CUALITATIVA',
        };
    }));
}

/** Promedio general: la media de las materias CON notas (un 0 es una nota), a un decimal. */
function promedioGeneral(materias: Array<{ average: number; conNotas: boolean }>): { promedio: number; conNotas: boolean } {
    const conNotas = materias.filter((m) => m.conNotas);
    if (conNotas.length === 0) return { promedio: 0, conNotas: false };
    const redondeadas = conNotas.map((m) => parseFloat(Number(m.average || 0).toFixed(1)));
    return {
        promedio: Math.round((redondeadas.reduce((a, b) => a + b, 0) / redondeadas.length) * 10) / 10,
        conNotas: true,
    };
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
            select: { id: true, name: true, startDate: true, endDate: true }
        });

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
                const studentSubjectAverages = await db.grade.groupBy({
                    by: ['studentId', 'subjectId'],
                    where: {
                        period: { academicYearId: activeYear.id },
                        score: { not: null },
                        ...NOTAS_QUE_CUENTAN,
                    },
                    _avg: { score: true },
                    having: {
                        score: { _avg: { lt: minPassing } }
                    }
                });
                const uniqueStudents = new Set(studentSubjectAverages.map(s => s.studentId));

                // Agrupamos materias aplazadas por estudiante
                const failedMap = new Map<string, number>();
                for (const item of studentSubjectAverages) {
                    failedMap.set(item.studentId, (failedMap.get(item.studentId) || 0) + 1);
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

        // El promedio del liceo, el mismo de las estadísticas del ciclo (en
        // bloque y guardado en la memoria rápida: no recalcula en cada visita).
        let promedioGeneral: number | null = null;
        if (activeYear) {
            try {
                const { cycleStatisticsService } = await import('./cycle-statistics.service');
                const ciclo = await cycleStatisticsService.getCycleGlobalAverage(db, activeYear.id, instituteId);
                promedioGeneral = ciclo.globalAverage > 0 ? ciclo.globalAverage : null;
            } catch {
                promedioGeneral = null;
            }
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

    /**
     * Dashboard para Profesores (Fase C)
     *
     * Métricas calculadas en bloque sin N+1:
     * - Promedio general: media de los promedios alumno-materia con notas de las parejas (sección, materia)
     *   del ciclo activo donde es docente (`bulkSubjectAveragesConDatos`).
     * - Asistencia: clases de los últimos 30 días (`groupBy` por estado en `dailyAttendance`).
     * - En riesgo: alumnos distintos con alguna de SUS materias reprobadas (< notaMinimaAprobatoria).
     * - Sección guía: indica si es profesor guía de alguna sección activa.
     * - Eventos de hoy / calendario del ciclo.
     */
    async getTeacherDashboard(userId: string, db: PrismaClient, instituteId?: string): Promise<TeacherDashboardDto> {
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
            select: { id: true, name: true, startDate: true, endDate: true },
        });

        const tz = await instituteTimezone(db);
        const hoyStr = todayInTimezone(tz);
        const [y, m, d] = hoyStr.split('-').map(Number);
        const hoyDate = new Date(Date.UTC(y, m - 1, d));
        const thirtyDaysAgo = new Date(hoyDate.getTime() - 30 * 864e5);
        const now = new Date();
        const startOfCycle = activeYear?.startDate || new Date(now.getFullYear(), 0, 1);

        // Secciones que le tocan: las que guía, donde imparte una materia o en teachers (mismo criterio que las-secciones-que-me-tocan)
        const classrooms = await db.classroom.findMany({
            where: {
                OR: [
                    { teacherId: userId },
                    { subjects: { some: { teacherId: userId } } },
                    { teachers: { some: { teacherId: userId } } },
                ],
                isActive: true,
                ...(activeYear ? { academicYearId: activeYear.id } : {}),
            },
            select: {
                id: true,
                name: true,
                grade: true,
                section: true,
                _count: { select: { studentClassrooms: { where: { isActive: true } } } },
            },
        });
        const classroomIds = classrooms.map((c) => c.id);

        const [
            teacher,
            upcomingActivities,
            pendingGrades,
            attendanceGrouped,
            guideCount,
            classroomSubjects,
            rawEvents,
            currentPeriod,
        ] = await Promise.all([
            db.user.findUnique({
                where: { id: userId },
                select: { id: true, firstName: true, lastName: true, specialization: true },
            }),
            db.activity.findMany({
                where: { createdBy: userId, dueDate: { gte: new Date() }, isActive: true },
                take: 5,
                orderBy: { dueDate: 'asc' },
                select: {
                    id: true,
                    title: true,
                    type: true,
                    dueDate: true,
                    classroom: { select: { name: true } },
                    subject: { select: { name: true } },
                },
            }),
            db.activity.count({
                where: { createdBy: userId, isActive: true, grades: { none: {} } },
            }),
            classroomIds.length > 0
                ? db.dailyAttendance.groupBy({
                      by: ['status'],
                      where: {
                          classroomId: { in: classroomIds },
                          date: { gte: thirtyDaysAgo },
                      },
                      _count: { _all: true },
                  })
                : [],
            activeYear
                ? db.classroom.count({
                      where: { teacherId: userId, academicYearId: activeYear.id, isActive: true },
                  })
                : db.classroom.count({
                      where: { teacherId: userId, isActive: true },
                  }),
            activeYear
                ? db.classroomSubject.findMany({
                      where: {
                          teacherId: userId,
                          classroom: { academicYearId: activeYear.id, isActive: true },
                      },
                      select: { classroomId: true, subjectId: true },
                  })
                : [],
            activeYear
                ? db.schoolEvent.findMany({
                      where: {
                          academicYearId: activeYear.id,
                          date: { gte: startOfCycle },
                      },
                      orderBy: { date: 'asc' },
                      select: {
                          id: true,
                          title: true,
                          description: true,
                          date: true,
                          startTime: true,
                          endTime: true,
                          scope: true,
                      },
                  })
                : [],
            activeYear
                ? db.period.findFirst({
                      where: {
                          academicYearId: activeYear.id,
                          startDate: { lte: now },
                          endDate: { gte: now },
                      },
                      select: { id: true, name: true, startDate: true, endDate: true },
                  })
                : null,
        ]);

        if (!teacher) throw new Error('Profesor no encontrado');

        const totalStudents = classrooms.reduce((sum, c) => sum + (c._count?.studentClassrooms || 0), 0);
        const isGuideTeacher = guideCount > 0;

        // Asistencia de sus clases en los últimos 30 días
        const attTotal = attendanceGrouped.reduce((sum, g) => sum + g._count._all, 0);
        const attPresent = attendanceGrouped
            .filter((g) => g.status === 'PRESENT' || g.status === 'LATE')
            .reduce((sum, g) => sum + g._count._all, 0);
        const averageAttendance = attTotal > 0 ? Math.round((attPresent * 100.0) / attTotal) : 0;

        // Promedio general y alumnos en riesgo: en bloque, una pasada por sección.
        // Sin memoria propia: /api/dashboard ya se guarda entero 5 min
        // (`cache-ttl.ts`). Una segunda copia de 1 h, que nada borraba al poner
        // notas, dejaba el promedio viejo después de calificar.
        let statsCalculadas: { promedioGeneral: number | null; studentsAtRisk: number } | null = null;

        if (!statsCalculadas) {
            const materiasPorSeccion = new Map<string, string[]>();
            for (const cs of classroomSubjects) {
                if (!materiasPorSeccion.has(cs.classroomId)) materiasPorSeccion.set(cs.classroomId, []);
                materiasPorSeccion.get(cs.classroomId)!.push(cs.subjectId);
            }

            const classroomIds = Array.from(materiasPorSeccion.keys());
            const inscripciones = classroomIds.length > 0 && activeYear
                ? await db.studentClassroom.findMany({
                      where: {
                          classroomId: { in: classroomIds },
                          academicYearId: activeYear.id,
                          isActive: true,
                      },
                      select: { classroomId: true, studentId: true },
                  })
                : [];

            const alumnosPorSeccion = new Map<string, string[]>();
            for (const ins of inscripciones) {
                if (!alumnosPorSeccion.has(ins.classroomId)) alumnosPorSeccion.set(ins.classroomId, []);
                alumnosPorSeccion.get(ins.classroomId)!.push(ins.studentId);
            }

            const promediosAlumnoMateriaConNotas: number[] = [];
            const alumnosEnRiesgoIds = new Set<string>();

            const resultadosSecciones = await Promise.all(
                Array.from(materiasPorSeccion.entries()).map(async ([classroomId, subjectIds]) => {
                    const studentIds = alumnosPorSeccion.get(classroomId) || [];
                    if (studentIds.length === 0 || subjectIds.length === 0) return null;
                    return bulkSubjectAveragesConDatos(db, { classroomId, studentIds, subjectIds });
                })
            );

            for (const res of resultadosSecciones) {
                if (!res) continue;
                for (const [studentId, materiasMap] of res.entries()) {
                    let tieneEnRiesgo = false;
                    for (const [, info] of materiasMap.entries()) {
                        if (info.conNotas) {
                            promediosAlumnoMateriaConNotas.push(info.promedio);
                            if (info.promedio < minPassing) {
                                tieneEnRiesgo = true;
                            }
                        }
                    }
                    if (tieneEnRiesgo) {
                        alumnosEnRiesgoIds.add(studentId);
                    }
                }
            }

            const promedioGeneral = promediosAlumnoMateriaConNotas.length > 0
                ? Math.round((promediosAlumnoMateriaConNotas.reduce((a, b) => a + b, 0) / promediosAlumnoMateriaConNotas.length) * 10) / 10
                : null;
            const studentsAtRisk = alumnosEnRiesgoIds.size;

            statsCalculadas = { promedioGeneral, studentsAtRisk };
        }

        const events = rawEvents.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            date: e.date.toISOString().split('T')[0],
            startTime: e.startTime,
            endTime: e.endTime,
            scope: e.scope,
            isHoliday: e.scope === 'FERIADO' || e.title.toLowerCase().includes('feriado') || e.title.toLowerCase().includes('sin clases'),
        }));

        const eventsCalendar = {
            currentPeriod: currentPeriod ? {
                id: currentPeriod.id,
                name: currentPeriod.name,
                startDate: currentPeriod.startDate.toISOString(),
                endDate: currentPeriod.endDate.toISOString(),
                daysLeft: Math.max(0, Math.ceil((currentPeriod.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
            } : null,
            events,
        };

        return {
            teacher: {
                id: teacher.id,
                fullName: `${teacher.firstName} ${teacher.lastName}`,
                specialization: teacher.specialization,
                isGuideTeacher,
            },
            classrooms: classrooms.map((c) => ({
                id: c.id,
                name: c.name,
                grade: c.grade,
                section: c.section,
                studentCount: c._count?.studentClassrooms || 0,
            })),
            upcomingActivities: upcomingActivities.map((a) => ({
                id: a.id,
                title: a.title,
                type: a.type,
                dueDate: a.dueDate?.toISOString() || '',
                classroom: a.classroom?.name || 'N/A',
                subject: a.subject?.name || 'N/A',
            })),
            stats: {
                totalStudents,
                totalClassrooms: classrooms.length,
                pendingGrades,
                promedioGeneral: statsCalculadas.promedioGeneral,
                averageAttendance,
                studentsAtRisk: statsCalculadas.studentsAtRisk,
                isGuideTeacher,
            },
            eventsCalendar,
            activeAcademicYear: activeYear?.name || null,
        };
    }

    /**
     * Dashboard para Estudiantes (IMPLEMENTADO)
     */
    async getStudentDashboard(userId: string, db: PrismaClient, instituteId?: string): Promise<StudentDashboardDto> {
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
        let configRedondeo: 'MPPE' | 'NINGUNO' = 'MPPE';
        if (resolvedInstituteId) {
            try {
                const config = await getAcademicConfig(resolvedInstituteId);
                minPassing = typeof config.notaMinimaAprobatoria === 'number' ? config.notaMinimaAprobatoria : 10;
                configRedondeo = config.redondeoDeDefinitivas || 'MPPE';
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
            materiasDelAlumnoConPromedio(db, userId, activeClassroomId, ventana.lapsosDelCiclo),

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
                let calculados: Array<{ periodId: string; subjectId: string; promedio: number; conNotas: boolean }>;
                if (activeClassroomId) {
                    // Una pasada en bloque por lapso (tres, no una por materia y lapso).
                    const materiasPorLapso = new Map<string, string[]>();
                    for (const par of pares.values()) {
                        if (!materiasPorLapso.has(par.periodId)) materiasPorLapso.set(par.periodId, []);
                        materiasPorLapso.get(par.periodId)!.push(par.subjectId);
                    }
                    const porLapso = await Promise.all(
                        [...materiasPorLapso.entries()].map(async ([periodId, subjectIds]) => {
                            const r = await bulkSubjectAveragesConDatos(db, {
                                classroomId: activeClassroomId,
                                studentIds: [userId],
                                subjectIds,
                                periodId,
                            });
                            const suyos = r.get(userId);
                            return subjectIds.map((id) => ({
                                periodId,
                                subjectId: id,
                                promedio: suyos?.get(id)?.promedio ?? 0,
                                conNotas: suyos?.get(id)?.conNotas ?? false,
                            }));
                        })
                    );
                    calculados = porLapso.flat();
                } else {
                    calculados = await Promise.all(
                        [...pares.values()].map(async (par) => {
                            const d = await gradesService.promedioDeLaMateria(
                                db as PrismaClient, userId, par.subjectId, par.periodId
                            );
                            return { periodId: par.periodId, subjectId: par.subjectId, promedio: d.promedio, conNotas: d.conNotas };
                        })
                    );
                }
                for (const c of calculados) {
                    // Un 0 es una nota: cuenta en el lapso (antes `promedio > 0`).
                    if (c.conNotas) {
                        if (!avgByPeriod.has(c.periodId)) avgByPeriod.set(c.periodId, []);
                        avgByPeriod.get(c.periodId)!.push(c.promedio);
                    }
                }

                const periodAverages = periods.map(p => {
                    const grades = avgByPeriod.get(p.id) || [];
                    const average = grades.length > 0
                        ? grades.reduce((a, b) => a + b, 0) / grades.length
                        : 0;
                    return { periodId: p.id, periodName: p.name, average: Math.round(average * 10) / 10 };
                });

                const lapsosPorMateria = new Map<string, number[]>();
                for (const c of calculados) {
                    if (c.conNotas) {
                        if (!lapsosPorMateria.has(c.subjectId)) lapsosPorMateria.set(c.subjectId, []);
                        lapsosPorMateria.get(c.subjectId)!.push(c.promedio);
                    }
                }

                return { periodAverages, lapsosPorMateria };
            })()
        ]);

        const { periodAverages, lapsosPorMateria } = periodData;

        const subjects = (gradesStats && Array.isArray(gradesStats) && gradesStats.length > 0)
            ? gradesStats.map(s => ({
                id: s.subjectId,
                name: s.subjectName,
                average: parseFloat(Number(s.average || 0).toFixed(1)),
                color: s.subjectColor || '#666',
                status: (s.average || 0) >= minPassing ? 'Aprobado' : 'Reprobado',
                hasGrades: (s as any).conNotas !== false,
                cualitativa: (s as any).cualitativa ?? false,
            }))
            : [];

        // REVISION-FASE-E (punto 3): el promedio del estudiante en Inicio es
        // exactamente el mismo de la boleta (`calcularPromedioBoletaDesdeLapsos`), la misma cuenta oficial.
        const materiasParaBoleta = [...lapsosPorMateria.entries()].map(([subjectId, lapsos]) => {
            const s = subjects.find((subj: any) => subj.id === subjectId);
            return {
                lapsos,
                cualitativa: s?.cualitativa ?? false,
            };
        });

        const promedioBoleta = calcularPromedioBoletaDesdeLapsos(
            materiasParaBoleta,
            configRedondeo,
            minPassing
        );

        const globalAverage = promedioBoleta !== null
            ? promedioBoleta
            : promedioGeneral(
                subjects.map((s: any) => ({ average: s.average, conNotas: s.hasGrades }))
            ).promedio;

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
                                        classroom: { select: { id: true, grade: true, section: true, shift: true } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!tutor) throw new Error('Tutor no encontrado');

        let resolvedInstituteId = instituteId;
        if (!resolvedInstituteId) {
            const inst = await platformPrisma.institute.findFirst({ select: { id: true } });
            resolvedInstituteId = inst?.id ?? '';
        }
        const hoy = todayInTimezone(await instituteTimezone(db));

        const childrenWithStats = await Promise.all(
            tutor.children.map(async (child: any) => {
                const childStudentId = child.student.id;
                const childAcademicYearId = child.student.studentClassrooms?.[0]?.academicYearId ?? null;
                const ventanaHijo = await ventanaDelLapsoYCiclo(
                    db,
                    childAcademicYearId
                );

                // REVISION-FASE-E (punto 3): cada hijo muestra el promedio de la boleta
                // oficial (`boletaDelAlumno`), consultado en paralelo y sin N+1 con la sección.
                const [boleta, asistencia] = await Promise.all([
                    (async () => {
                        try {
                            return await boletaDelAlumno(db, resolvedInstituteId, childStudentId, {
                                academicYearId: childAcademicYearId || undefined,
                                hoy,
                            });
                        } catch {
                            return null;
                        }
                    })(),
                    asistenciaEnLaVentana(db, childStudentId, ventanaHijo.lapso),
                ]);

                const childClassroom = child.student.studentClassrooms?.[0]?.classroom;
                const boletaPromedio = boleta?.promedios?.definitivo ?? null;
                const hasGrades = boletaPromedio !== null;
                const average = boletaPromedio !== null ? boletaPromedio : 0;

                return {
                    id: childStudentId,
                    fullName: `${child.student.firstName} ${child.student.lastName}`,
                    firstName: child.student.firstName,
                    lastName: child.student.lastName,
                    avatar: child.student.avatar,
                    classroom: childClassroom
                        ? `${childClassroom.grade}° ${childClassroom.section}`
                        : null,
                    // La sección, para poder abrir SU horario y su calendario.
                    classroomId: childClassroom?.id ?? null,
                    shift: childClassroom?.shift ?? null,
                    average,
                    hasGrades,
                    attendancePercentage: Math.round(Number(asistencia?.porcentaje || 0)),
                    hasAttendance: (asistencia?.registros ?? 0) > 0,
                    relationship: child.relationship
                };
            })
        );

        const alerts = childrenWithStats
            .filter(c => (c.hasGrades && c.average < minPassing) || (c.hasAttendance && c.attendancePercentage < asistenciaMinima))
            .map(c => ({
                studentId: c.id,
                studentName: c.fullName,
                type: (c.hasGrades && c.average < minPassing) ? 'ACADEMIC' : 'ATTENDANCE',
                message: (c.hasGrades && c.average < minPassing)
                    ? `Promedio bajo: ${c.average}`
                    : `Asistencia baja: ${c.attendancePercentage}%`,
                date: new Date().toISOString()
            }));

        return {
            tutor: { id: tutor.id, fullName: `${tutor.firstName} ${tutor.lastName}` },
            children: childrenWithStats,
            representados: childrenWithStats,
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
