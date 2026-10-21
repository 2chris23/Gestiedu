import { PrismaClient } from '@prisma/client';
import { TeacherDashboardDto } from '../../dto/dashboard-response.dto';
import { getAcademicConfig } from '../promotion/configuracion-academica';
import { promediosDeLaSeccion } from '../aggregation.service';
import { instituteTimezone, todayInTimezone } from '../../utils/school-time';

/**
 * Dashboard para Profesores (Fase C)
 *
 * Métricas calculadas en bloque sin N+1:
 * - Promedio general: media de las notas oficiales de sus alumnos en sus
 *   clases del ciclo activo (`promediosDeLaSeccion`, la cuenta de la boleta).
 * - Asistencia: clases de los últimos 30 días (`groupBy` por estado en `dailyAttendance`).
 * - En riesgo: alumnos distintos con alguna de SUS materias reprobadas (< notaMinimaAprobatoria).
 * - Sección guía: indica si es profesor guía de alguna sección activa.
 * - Eventos de hoy / calendario del ciclo.
 */
export async function inicioDelProfesor(userId: string, db: PrismaClient, instituteId?: string): Promise<TeacherDashboardDto> {
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

        // Con las cifras oficiales (las de la boleta): el mismo número que
        // su fila en Profesores (`profesores.service`).
        const resultadosSecciones = await Promise.all(
            Array.from(materiasPorSeccion.entries()).map(async ([classroomId, subjectIds]) => {
                if ((alumnosPorSeccion.get(classroomId) || []).length === 0 || subjectIds.length === 0) return null;
                return promediosDeLaSeccion(db, classroomId, undefined, subjectIds);
            })
        );

        for (const res of resultadosSecciones) {
            if (!res) continue;
            for (const [studentId, materiasMap] of res.entries()) {
                let tieneEnRiesgo = false;
                for (const nota of materiasMap.values()) {
                    promediosAlumnoMateriaConNotas.push(nota);
                    if (nota < minPassing) tieneEnRiesgo = true;
                }
                if (tieneEnRiesgo) alumnosEnRiesgoIds.add(studentId);
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
