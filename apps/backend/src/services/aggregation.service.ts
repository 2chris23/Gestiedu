import { PrismaClient } from '@prisma/client';
import { gradesService } from './grades.service';
import { fechaDeLaActividad, lapsoDeLaFecha, LapsoConFechas } from '../utils/lapso-de-la-actividad';

/**
 * =====================================================================
 * MÓDULO ÚNICO DE AGREGACIÓN DE PROMEDIOS — JERARQUÍA 0 → 6
 * =====================================================================
 *
 * Principio del sistema: TODO promedio es el MISMO dato agregado hacia arriba.
 *  Nivel 0: Actividad calificada (Grade / ClassActivity.scores)         [existente]
 *  Nivel 1: Criterio del plan (fila EVALUATION)                         [lapso-average.ts]
 *  Nivel 2: Promedio del estudiante en Materia/Lapso                    [gradesService.calculateWeightedSubjectAverage]
 *  Nivel 3: Promedio de la Materia en la Sección  ← ESTE MÓDULO
 *  Nivel 4: Promedio de la Sección (Aula)         ← ESTE MÓDULO
 *  Nivel 5: Promedio del Año (nivel académico)    ← ESTE MÓDULO
 *  Nivel 6: Promedio del Ciclo Escolar            ← ESTE MÓDULO
 *
 * Cada nivel LLAMA al nivel de abajo (no reimplementa la fórmula):
 *   N4 = promedio de los N3 de las materias de la sección
 *   N5 = promedio de los N4 de las secciones del año
 *   N6 = promedio de los N5 de los grados del ciclo
 *
 * Reglas de exclusión (consistente con Fase 2.5):
 *  - Un estudiante SIN ninguna nota real en la materia se EXCLUYE del Nivel 3
 *    (no cuenta como 0). Lo mismo para materias/secciones/años sin datos.
 *  - "Tiene nota" = existe Grade del estudiante en la materia, o la nota vive
 *    en ClassActivity.scores (JSON, incluyendo las ad-hoc sin planRowId).
 *
 * FILTRO POR LAPSO (Fase 3.5 — Parte A):
 *  - Cada función acepta un parámetro opcional `periodId` (lapso/momento).
 *    Si se pasa, TODA la cadena usa SOLO las notas de ese lapso.
 *    Si no se pasa, el comportamiento es "Todo el ciclo" (global).
 *  - El modo global DEL N3 HACIA ARRIBA delega en el modo global del N2:
 *    calcula por lapso/grado del aula y hace la media simple de los lapsos
 *    con datos (misma regla de exclusión: un lapso sin notas no pesa).
 */

export interface AggregateResult {
    average: number;
    hasData: boolean;
}

/**
 * Helper: estudiantes de la sección con AL MENOS UNA nota real en la materia
 * (Grade con score, o nota en ClassActivity.scores — incluyendo ad-hoc).
 * Con `periodId`: solo notas de ese lapso (grades del período, o actividades
 * cuya fila del plan pertenece a ese lapso; las ad-hoc solo en el global).
 */
export async function studentsWithNoteInSubject(
    prisma: PrismaClient,
    classroomId: string,
    subjectId: string,
    periodId?: string
): Promise<Set<string>> {
    const enrollments = await prisma.studentClassroom.findMany({
        where: { classroomId, isActive: true },
        select: { studentId: true },
    });
    const studentIds = enrollments.map(e => e.studentId);
    const withData = new Set<string>();

    if (studentIds.length === 0) return withData;

    const gradesWhere: any = { studentId: { in: studentIds }, subjectId };
    if (periodId) gradesWhere.periodId = periodId;

    const [grades, classActivities] = await Promise.all([
        prisma.grade.findMany({ where: gradesWhere, select: { studentId: true, score: true } }),
        prisma.classActivity.findMany({
            where: { classroomId, subjectId, scores: { not: undefined } },
            select: { scores: true, planRowId: true, dueDate: true, createdAt: true, classSession: { select: { date: true } } },
        }),
    ]);
    grades.forEach(g => { if (g.score !== null) withData.add(g.studentId); });

    if (periodId) {
        // Filas del plan de ese lapso (para vincular actividades por planRow).
        const period = await prisma.period.findUnique({ where: { id: periodId }, select: { name: true, academicYearId: true } });
        const lapso = period ? segmentLapso(period.name) : '1';
        const [rows, lapsosDelCiclo] = await Promise.all([
            prisma.evaluationPlanRow.findMany({
                where: { subjectId, lapso },
                select: { id: true },
            }),
            period
                ? prisma.period.findMany({ where: { academicYearId: period.academicYearId }, select: { id: true, startDate: true, endDate: true } })
                : Promise.resolve([] as LapsoConFechas[]),
        ]);
        const rowIds = new Set(rows.map(r => r.id));
        classActivities.forEach(ca => {
            if (ca.planRowId) {
                if (rowIds.has(ca.planRowId)) pushStudentScores(ca, studentIds, withData);
                return;
            }
            // Las sueltas cuentan en el lapso de su fecha, igual que en el
            // promedio del alumno (LAP-01…03). Antes solo en el global.
            const suLapso = lapsoDeLaFecha(
                fechaDeLaActividad({ fechaDeLaClase: ca.classSession?.date, dueDate: ca.dueDate, createdAt: ca.createdAt }),
                lapsosDelCiclo
            );
            if (suLapso === null || suLapso === periodId) pushStudentScores(ca, studentIds, withData);
        });
    } else {
        classActivities.forEach(ca => pushStudentScores(ca, studentIds, withData));
    }
    return withData;
}

/** Extrae los estudiante con nota de un ClassActivity.scores JSON. */
function pushStudentScores(ca: any, studentIds: string[], withData: Set<string>): void {
    let parsed: Record<string, number | null> = {};
    try {
        parsed = typeof ca.scores === 'string' ? JSON.parse(ca.scores) : (ca.scores || {});
    } catch { /* ignorar */ }
    Object.keys(parsed).forEach(sid => {
        if (parsed[sid] !== null && parsed[sid] !== undefined && studentIds.includes(sid)) withData.add(sid);
    });
}

/** Mapea el nombre del periodo al lapso del plan (mismo criterio que gradesService). */
export function segmentLapso(periodName?: string | null): string {
    if (!periodName) return '1';
    const name = periodName.toLowerCase();
    if (name.includes('segundo') || name.includes('2do') || name.includes('2er') || name.includes('ii')) return '2';
    if (name.includes('tercer') || name.includes('3ro') || name.includes('3er') || name.includes('iii')) return '3';
    return '1';
}

/**
 * Nivel 3 — Promedio de MATERIA en SECCIÓN (con filtro opcional de lapso).
 * promedio de Nivel 2 (promedio por estudiante en la materia) de los
 * estudiantes de la sección con AL MENOS UNA nota en esa materia.
 */
export async function subjectSectionAverage(
    prisma: PrismaClient,
    classroomId: string,
    subjectId: string,
    periodId?: string
): Promise<AggregateResult> {
    const withData = await studentsWithNoteInSubject(prisma, classroomId, subjectId, periodId);
    if (withData.size === 0) return { average: 0, hasData: false };

    let sum = 0;
    for (const studentId of withData) {
        sum += await gradesService.calculateWeightedSubjectAverage(prisma, studentId, subjectId, periodId);
    }
    return { average: Math.round((sum / withData.size) * 100) / 100, hasData: true };
}

export interface SectionAverageResult extends AggregateResult {
    subjectAverages: Array<{ subjectId: string; subjectName: string; average: number }>;
}

/**
 * Promedios NIVEL 2 por estudiante de una sección (cada estudiante: promedio
 * de las materias donde tiene al menos una nota). Se usa para min/max/riesgo
 * en vistas de aula/año. Estudiantes sin notas se excluyen.
 */
export async function sectionStudentAverages(
    prisma: PrismaClient,
    classroomId: string,
    periodId?: string
): Promise<number[]> {
    const enrollments = await prisma.studentClassroom.findMany({
        where: { classroomId, isActive: true },
        select: { studentId: true },
    });
    const studentIds = enrollments.map(e => e.studentId);

    const classroomSubjects = await prisma.classroomSubject.findMany({
        where: { classroomId },
        select: { subjectId: true },
    });

    const out: number[] = [];
    for (const studentId of studentIds) {
        let sum = 0;
        let cnt = 0;
        for (const cs of classroomSubjects) {
            const withData = await studentsWithNoteInSubject(prisma, classroomId, cs.subjectId, periodId);
            if (withData.has(studentId)) {
                sum += await gradesService.calculateWeightedSubjectAverage(prisma, studentId, cs.subjectId, periodId);
                cnt++;
            }
        }
        if (cnt > 0) out.push(Math.round((sum / cnt) * 100) / 100);
    }
    return out;
}

/**
 * Nivel 4 — Promedio de la SECCIÓN (aula), con filtro opcional de lapso.
 * promedio de los Nivel 3 de las materias de la sección que tienen al menos
 * un estudiante calificado. Una materia sin notas NI AFECTA el promedio.
 */
export async function sectionAverage(
    prisma: PrismaClient,
    classroomId: string,
    periodId?: string
): Promise<SectionAverageResult> {
    const classroomSubjects = await prisma.classroomSubject.findMany({
        where: { classroomId },
        include: {
            subject: { select: { id: true, name: true } },
        },
    });

    let sum = 0;
    let cnt = 0;
    const subjectAverages: Array<{ subjectId: string; subjectName: string; average: number }> = [];
    for (const cs of classroomSubjects) {
        const n3 = await subjectSectionAverage(prisma, classroomId, cs.subjectId, periodId);
        if (n3.hasData) {
            sum += n3.average;
            cnt++;
        }
        subjectAverages.push({ subjectId: cs.subjectId, subjectName: cs.subject.name, average: n3.average });
    }

    return {
        average: cnt > 0 ? Math.round((sum / cnt) * 100) / 100 : 0,
        hasData: cnt > 0,
        subjectAverages,
    };
}

export interface YearGradeAverageResult extends AggregateResult {
    sectionAverages: Array<{ sectionId: string; sectionName: string; average: number }>;
}

/**
 * Nivel 5 — Promedio del AÑO (nivel académico), con filtro opcional de lapso.
 * promedio de los Nivel 4 de las secciones de ese grado con datos.
 */
export async function yearGradeAverage(
    prisma: PrismaClient,
    academicYearId: string,
    gradeLevel: number,
    periodId?: string
): Promise<YearGradeAverageResult> {
    const sections = await prisma.classroom.findMany({
        where: { academicYearId, grade: gradeLevel },
        select: { id: true, name: true },
    });

    let sum = 0;
    let cnt = 0;
    const sectionAverages: Array<{ sectionId: string; sectionName: string; average: number }> = [];
    for (const section of sections) {
        const n4 = await sectionAverage(prisma, section.id, periodId);
        if (n4.hasData) {
            sum += n4.average;
            cnt++;
        }
        sectionAverages.push({ sectionId: section.id, sectionName: section.name, average: n4.average });
    }

    return {
        average: cnt > 0 ? Math.round((sum / cnt) * 100) / 100 : 0,
        hasData: cnt > 0,
        sectionAverages,
    };
}

export interface CycleAverageResult extends AggregateResult {
    gradeAverages: Array<{ gradeLevel: number; average: number }>;
}

/**
 * Nivel 6 — Promedio del CICLO ESCOLAR, con filtro opcional de lapso.
 * promedio de los Nivel 5 de todos los grados del ciclo con datos.
 */
export async function cycleAverage(
    prisma: PrismaClient,
    academicYearId: string,
    periodId?: string
): Promise<CycleAverageResult> {
    const gradeLevels = await prisma.classroom.findMany({
        where: { academicYearId },
        select: { grade: true },
        distinct: ['grade'],
    });

    let sum = 0;
    let cnt = 0;
    const gradeAverages: Array<{ gradeLevel: number; average: number }> = [];
    for (const { grade } of gradeLevels) {
        const n5 = await yearGradeAverage(prisma, academicYearId, grade, periodId);
        if (n5.hasData) {
            sum += n5.average;
            cnt++;
        }
        gradeAverages.push({ gradeLevel: grade, average: n5.average });
    }

    return {
        average: cnt > 0 ? Math.round((sum / cnt) * 100) / 100 : 0,
        hasData: cnt > 0,
        gradeAverages,
    };
}

export interface YearGradeStudentDetails {
    /** Promedio (Nivel 2 por estudiante → media de materias con nota). */
    studentAverages: number[];
    /** Promedio del año (Nivel 5). */
    average: number;
}

/**
 * Detalle por estudiante de un año/grade: cada estudiante con datos aporta su
 * promedio de materias (cada materia = Nivel 2). Se usa para min/max/riesgo
 * de los dashboards por año. Estudiantes sin ninguna nota se excluyen.
 */
export async function yearGradeStudentDetails(
    prisma: PrismaClient,
    academicYearId: string,
    gradeLevel: number,
    periodId?: string
): Promise<YearGradeStudentDetails> {
    const sections = await prisma.classroom.findMany({
        where: { academicYearId, grade: gradeLevel },
        select: { id: true },
    });
    const sectionIds = sections.map(s => s.id);

    const enrollments = await prisma.studentClassroom.findMany({
        where: { classroomId: { in: sectionIds }, isActive: true },
        select: { studentId: true, classroomId: true },
    });

    const studentClassroom = new Map<string, string>();
    enrollments.forEach(e => studentClassroom.set(e.studentId, e.classroomId));

    const classroomSubjects = await prisma.classroomSubject.findMany({
        where: { classroomId: { in: sectionIds } },
        select: { classroomId: true, subjectId: true },
    });
    const subjectsByClassroom = new Map<string, string[]>();
    classroomSubjects.forEach(cs => {
        const list = subjectsByClassroom.get(cs.classroomId) || [];
        list.push(cs.subjectId);
        subjectsByClassroom.set(cs.classroomId, list);
    });

    const studentAverages: number[] = [];
    for (const [studentId, classroomId] of studentClassroom.entries()) {
        const subjectIds = subjectsByClassroom.get(classroomId) || [];
        let sum = 0;
        let cnt = 0;
        for (const subjectId of subjectIds) {
            const n3 = await subjectSectionAverage(prisma, classroomId, subjectId, periodId);
            if (n3.hasData) {
                // Nivel 2 del estudiante en la materia — solo si ÉL tiene nota
                const avg2 = await gradesService.calculateWeightedSubjectAverage(prisma, studentId, subjectId, periodId);
                if (avg2 > 0) {
                    sum += avg2;
                    cnt++;
                }
            }
        }
        if (cnt > 0) studentAverages.push(Math.round((sum / cnt) * 100) / 100);
    }

    const avg = studentAverages.length > 0
        ? Math.round((studentAverages.reduce((a, b) => a + b, 0) / studentAverages.length) * 100) / 100
        : 0;

    return { studentAverages, average: avg };
}
