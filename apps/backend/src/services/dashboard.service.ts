import { PrismaClient } from '@prisma/client';
import { UserRole } from '../utils/prisma-enums';
import { gradesService } from './grades.service';
import { AdminDashboardDto, TeacherDashboardDto, StudentDashboardDto, TutorDashboardDto } from '../dto/dashboard-response.dto';
import { getAcademicConfig, DEFAULT_ACADEMIC_CONFIG } from './promotion/close-cycle.service';
import { bulkSubjectAveragesConDatos } from './bulk-averages.service';
import { NOTAS_QUE_CUENTAN } from './apreciaciones.service';

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
    const subjects = await db.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true, color: true } });

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
            studentHonorRanking,
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

            // Cuadro de Honor / Ranking de Alumnos del ciclo escolar actual
            (async () => {
                if (!activeYear) return [];
                // 1. Obtener candidatos con mejores notas en el ciclo activo
                const studentAverages = await db.grade.groupBy({
                    by: ['studentId'],
                    where: {
                        period: { academicYearId: activeYear.id },
                        score: { not: null },
                        ...NOTAS_QUE_CUENTAN,
                    },
                    _avg: { score: true },
                    having: {
                        score: { _avg: { gte: 10 } }
                    },
                    orderBy: {
                        _avg: { score: 'desc' }
                    },
                    take: 25
                });

                if (studentAverages.length === 0) return [];

                const candidateIds = studentAverages.map(s => s.studentId);

                // 2. Cargar datos del alumno y su sección activa
                const [studentsInfo, attendanceData, observationsData] = await Promise.all([
                    db.user.findMany({
                        where: { id: { in: candidateIds } },
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            avatar: true,
                            studentClassrooms: {
                                where: { isActive: true },
                                select: {
                                    classroom: {
                                        select: { name: true, grade: true, section: true }
                                    }
                                },
                                take: 1
                            }
                        }
                    }),
                    // Asistencia agrupada
                    (db.dailyAttendance as any).groupBy({
                        by: ['studentId', 'status'],
                        where: {
                            studentId: { in: candidateIds }
                        },
                        _count: { _all: true }
                    }),
                    // Observaciones (incidentes negativos)
                    db.observation.groupBy({
                        by: ['studentId'],
                        where: {
                            studentId: { in: candidateIds }
                        },
                        _count: { _all: true }
                    })
                ]);

                // Mapas rápidos
                const studentMap = new Map(studentsInfo.map(s => [s.id, s]));

                // Mapa de asistencia: { total, present }
                const attMap = new Map<string, { total: number; present: number }>();
                for (const att of (attendanceData as Array<{ studentId: string; status: string; _count: { _all: number } }>)) {
                    const cur = attMap.get(att.studentId) || { total: 0, present: 0 };
                    cur.total += att._count._all;
                    if (att.status === 'PRESENT' || att.status === 'LATE') {
                        cur.present += att._count._all;
                    }
                    attMap.set(att.studentId, cur);
                }

                // Mapa de incidentes (observaciones negativas)
                const obsMap = new Map<string, number>();
                for (const obs of observationsData) {
                    obsMap.set(obs.studentId, obs._count._all);
                }

                // Calcular puntajes integrales: 80% Académico, 20% Asistencia, -5 pts por cada incidente
                const rankedList = studentAverages.map(cand => {
                    const st = studentMap.get(cand.studentId);
                    const avg = Math.round((cand._avg.score || 0) * 10) / 10;
                    const academicScore = Math.round(((avg / 20) * 80) * 10) / 10;

                    const att = attMap.get(cand.studentId);
                    const attPct = att && att.total > 0 ? Math.round((att.present * 100) / att.total) : 100;
                    const attendanceScore = Math.round(((attPct / 100) * 20) * 10) / 10;

                    const incidentsCount = obsMap.get(cand.studentId) || 0;
                    const penaltyScore = incidentsCount * 5;

                    const totalScore = Math.max(0, Math.round((academicScore + attendanceScore - penaltyScore) * 10) / 10);

                    const cls = st?.studentClassrooms?.[0]?.classroom;

                    return {
                        id: cand.studentId,
                        name: st ? `${st.firstName} ${st.lastName}` : cand.studentId,
                        avatar: st?.avatar || null,
                        classroomName: cls?.name || 'Sección activa',
                        grade: cls?.grade || null,
                        section: cls?.section || null,
                        averageScore: avg,
                        attendancePercentage: attPct,
                        incidentsCount,
                        academicScore,
                        attendanceScore,
                        penaltyScore,
                        totalScore
                    };
                });

                // Ordenar por puntaje total descendente y tomar Top 5
                rankedList.sort((a, b) => b.totalScore - a.totalScore || b.averageScore - a.averageScore);

                return rankedList.slice(0, 5).map((item, index) => ({
                    ...item,
                    position: index + 1
                }));
            })(),

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
            })),
            todayAttendance,
            atRiskStudentsTop: studentsAtRisk.top,
            gradeCapacity,
            periodClosure: eventsAndClosure.periodClosure,
            upcomingEvents: eventsAndClosure.events,
            studentHonorRanking,
            eventsCalendar
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
                let calculados: Array<{ periodId: string; promedio: number; conNotas: boolean }>;
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
                            return { periodId: par.periodId, promedio: d.promedio, conNotas: d.conNotas };
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
                status: (s.average || 0) >= minPassing ? 'Aprobado' : 'Reprobado',
                hasGrades: (s as any).conNotas !== false,
            }))
            : [];

        // Un 0 es una nota: la materia con todo en 0 cuenta en el promedio y
        // como reprobada. Lo que no cuenta es la materia SIN notas (CERO-*).
        // El mismo número que ve el representante (`promedioGeneral`, REP-01).
        const globalAverage = promedioGeneral(
            subjects.map((s: any) => ({ average: s.average, conNotas: s.hasGrades }))
        ).promedio;

        const failedSubjects = subjects.filter(s => s.hasGrades && s.average < minPassing).length;

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
                    // El MISMO cálculo que el panel del alumno (REP-01).
                    const suAula = child.student.studentClassrooms?.[0]?.classroom?.id ?? null;
                    const [materias, asistencia] = await Promise.all([
                        materiasDelAlumnoConPromedio(db, child.student.id, suAula, ventanaHijo.lapsosDelCiclo),
                        asistenciaEnLaVentana(db, child.student.id, ventanaHijo.lapso),
                    ]);
                    const general = promedioGeneral(materias);
                    return [{
                        average: general.promedio,
                        // Un 0 es una nota: el aviso de promedio bajo mira si
                        // HAY notas, no si el promedio pasa de 0 (CERO-07).
                        hasGrades: general.conNotas,
                        attendancePercentage: asistencia.porcentaje,
                        // Sin ningún registro en el lapso no hay dato que juzgar (REP-02).
                        hasAttendance: asistencia.registros > 0,
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
                    // La sección, para poder abrir SU horario y su calendario.
                    classroomId: childClassroom?.id ?? null,
                    shift: childClassroom?.shift ?? null,
                    average: parseFloat(Number(stats?.average || 0).toFixed(1)),
                    hasGrades: !!stats?.hasGrades,
                    attendancePercentage: Math.round(Number(stats?.attendancePercentage || 0)),
                    hasAttendance: !!stats?.hasAttendance,
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
