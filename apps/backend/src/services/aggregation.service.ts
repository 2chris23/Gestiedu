import { PrismaClient } from '@prisma/client';
import { cifrasOficialesDeVariasSecciones, CifrasOficiales, notaOficial, promedioOficial } from './cifras-oficiales.service';

/**
 * EL NIVEL 2 DE TODA UNA SECCIÓN, EN BLOQUE — CON LA CUENTA OFICIAL
 *
 * Desde el 19-oct-2026 cada nivel de arriba sale de las CIFRAS OFICIALES de
 * cada alumno (`cifras-oficiales.service`: la cuenta de la boleta, con el
 * redondeo del liceo). Antes se promediaba el nivel 2 sin redondear y el
 * promedio de una sección en una pantalla no era la media de lo que cada
 * alumno veía en su boleta (`scripts/barrido-de-cifras.ts`).
 *
 * studentId → subjectId → nota oficial (la del lapso pedido, o la que cuenta
 * en el año). Quien no tiene nota en una materia no sale en el mapa.
 */
export type PromediosDeLaSeccion = Map<string, Map<string, number>>;

async function oficialesDeLaSeccion(prisma: PrismaClient, classroomId: string, soloMaterias?: string[]): Promise<Map<string, CifrasOficiales>> {
    return (await oficialesDeVariasSecciones(prisma, [classroomId], soloMaterias)).get(classroomId) ?? new Map();
}

/** Las de varias secciones con las mismas consultas (`cifrasOficialesDeVariasSecciones`). */
async function oficialesDeVariasSecciones(prisma: PrismaClient, classroomIds: string[], soloMaterias?: string[]): Promise<Map<string, Map<string, CifrasOficiales>>> {
    if (classroomIds.length === 0) return new Map();
    const enrollments = await prisma.studentClassroom.findMany({
        where: { classroomId: { in: classroomIds }, isActive: true },
        select: { studentId: true, classroomId: true },
    });
    const alumnosDe = new Map<string, string[]>(classroomIds.map((id) => [id, []]));
    for (const e of enrollments) alumnosDe.get(e.classroomId)?.push(e.studentId);
    return cifrasOficialesDeVariasSecciones(prisma, undefined, classroomIds.map((id) => ({ classroomId: id, studentIds: alumnosDe.get(id)! })), soloMaterias);
}

function aPromedios(oficiales: Map<string, CifrasOficiales>, periodId?: string, soloMaterias?: string[]): PromediosDeLaSeccion {
    const salida: PromediosDeLaSeccion = new Map();
    for (const [sid, c] of oficiales) {
        const suyas = new Map<string, number>();
        for (const subjectId of c.materias.keys()) {
            if (soloMaterias && !soloMaterias.includes(subjectId)) continue;
            const n = notaOficial(c, subjectId, periodId);
            if (n !== null) suyas.set(subjectId, n);
        }
        salida.set(sid, suyas);
    }
    return salida;
}

export async function promediosDeLaSeccion(
    prisma: PrismaClient,
    classroomId: string,
    periodId?: string,
    soloMaterias?: string[]
): Promise<PromediosDeLaSeccion> {
    return aPromedios(await oficialesDeLaSeccion(prisma, classroomId, soloMaterias), periodId, soloMaterias);
}

/** `promediosDeLaSeccion` de varias secciones a la vez: classroomId → sus promedios. */
export async function promediosDeVariasSecciones(
    prisma: PrismaClient,
    classroomIds: string[],
    periodId?: string,
    soloMaterias?: string[]
): Promise<Map<string, PromediosDeLaSeccion>> {
    const todas = await oficialesDeVariasSecciones(prisma, classroomIds, soloMaterias);
    return new Map(classroomIds.map((id) => [id, aPromedios(todas.get(id) ?? new Map(), periodId, soloMaterias)]));
}

const media2 = (xs: number[]) => (xs.length === 0 ? 0 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100);

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
    periodId?: string,
    promedios?: PromediosDeLaSeccion
): Promise<AggregateResult> {
    const n2 = promedios ?? (await promediosDeLaSeccion(prisma, classroomId, periodId, [subjectId]));
    const notas = [...n2.values()].map((m) => m.get(subjectId)).filter((n): n is number => typeof n === 'number');
    if (notas.length === 0) return { average: 0, hasData: false };
    return { average: media2(notas), hasData: true };
}

export interface SectionAverageResult extends AggregateResult {
    subjectAverages: Array<{ subjectId: string; subjectName: string; average: number }>;
}
/**
 * Nivel 4 — Promedio de la SECCIÓN: la media del promedio oficial de sus
 * alumnos con notas (MAPA-08: cuadra con el de sus alumnos). Las materias, su
 * nivel 3 con las mismas cifras.
 */
export async function sectionAverage(
    prisma: PrismaClient,
    classroomId: string,
    periodId?: string
): Promise<SectionAverageResult> {
    const [classroomSubjects, oficiales] = await Promise.all([
        prisma.classroomSubject.findMany({ where: { classroomId }, include: { subject: { select: { id: true, name: true } } } }),
        oficialesDeLaSeccion(prisma, classroomId),
    ]);
    const deLosAlumnos = [...oficiales.values()].map((c) => promedioOficial(c, periodId)).filter((n): n is number => n !== null);
    const subjectAverages = classroomSubjects.map((cs) => {
        const notas = [...oficiales.values()].map((c) => notaOficial(c, cs.subjectId, periodId)).filter((n): n is number => n !== null);
        return { subjectId: cs.subjectId, subjectName: cs.subject.name, average: media2(notas) };
    });
    return { average: media2(deLosAlumnos), hasData: deLosAlumnos.length > 0, subjectAverages };
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
    return (await promediosDelAno(prisma, academicYearId, periodId)).get(gradeLevel) ?? { average: 0, hasData: false, sectionAverages: [] };
}

/** Cada grado del año con sus secciones, de una sola pasada (las mismas consultas para todo el año). */
async function promediosDelAno(prisma: PrismaClient, academicYearId: string, periodId?: string): Promise<Map<number, YearGradeAverageResult>> {
    const sections = await prisma.classroom.findMany({ where: { academicYearId }, select: { id: true, name: true, grade: true } });
    const todas = await oficialesDeVariasSecciones(prisma, sections.map((s) => s.id));
    const salida = new Map<number, YearGradeAverageResult>();
    for (const section of sections) {
        const deLosAlumnos = [...(todas.get(section.id) ?? new Map()).values()]
            .map((c) => promedioOficial(c, periodId))
            .filter((n): n is number => n !== null);
        const g = salida.get(section.grade) ?? { average: 0, hasData: false, sectionAverages: [] };
        g.sectionAverages.push({ sectionId: section.id, sectionName: section.name, average: media2(deLosAlumnos), conDatos: deLosAlumnos.length > 0 } as any);
        salida.set(section.grade, g);
    }
    for (const g of salida.values()) {
        const conDatos = g.sectionAverages.filter((x: any) => x.conDatos).map((x) => x.average);
        g.average = media2(conDatos);
        g.hasData = conDatos.length > 0;
        for (const x of g.sectionAverages as any[]) delete x.conDatos;
    }
    return salida;
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
    const porGrado = await promediosDelAno(prisma, academicYearId, periodId);
    const grados = [...porGrado.entries()].sort((a, b) => a[0] - b[0]);
    const conDatos = grados.filter(([, g]) => g.hasData).map(([, g]) => g.average);
    return {
        average: media2(conDatos),
        hasData: conDatos.length > 0,
        gradeAverages: grados.map(([gradeLevel, g]) => ({ gradeLevel, average: g.average })),
    };
}