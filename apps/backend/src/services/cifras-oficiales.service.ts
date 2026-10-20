import { PrismaClient } from '@prisma/client';
import { redondearComoElMPPE } from './grades.service';
import { getAcademicConfig, DEFAULT_ACADEMIC_CONFIG } from './promotion/close-cycle.service';
import { liceoActual } from '../config/ambito-del-liceo';
import { bulkNotasPorLapsoDeVariasSecciones } from './bulk-averages.service';

/**
 * LAS CIFRAS OFICIALES DEL ALUMNO: UNA SOLA CUENTA (19-oct-2026)
 *
 * Cristian: «nada de que un usuario tenga un promedio y en otra parte otro».
 * El barrido (`scripts/barrido-de-cifras.ts`) encontró, con 40 alumnos, 246
 * diferencias: la boleta decía 14 en una materia y la ficha y el Inicio 14,2;
 * el promedio general salía 13,33 en la boleta, 13,3 en la ficha y 13,4 en la
 * lista; el resumen de la sección daba de máximo 13,7 con un alumno en 17,47.
 * Cada pantalla tenía su cuenta.
 *
 * Vale la de la BOLETA (MAPA §6, decidido): cada lapso de cada materia con el
 * redondeo del liceo; la definitiva, la media de esos lapsos redondeada otra
 * vez; si reprobó y presentó revisión, cuenta la revisión; y el promedio, la
 * media de lo que cuenta, a dos decimales. Las materias con apreciación no
 * entran. Esto la calcula **en bloque para toda una sección** (una pasada por
 * lapso, no una por alumno) y la usan la boleta, la ficha, el Inicio del
 * alumno, la lista de alumnos y el resumen de la sección.
 */

export interface NotaOficialDeLaMateria {
    /** La nota de cada lapso (id del lapso), ya redondeada; null = sin notas. */
    notas: Record<string, number | null>;
    definitiva: number | null;
    /** La de la revisión, solo si reprobó y la presentó: es la que cuenta. */
    revision: number | null;
    /** Lo que cuenta: la revisión si la hay, si no la definitiva. */
    queCuenta: number | null;
}

export interface CifrasOficiales {
    materias: Map<string, NotaOficialDeLaMateria>;
    /** El promedio de cada lapso (media de las notas del lapso de cada materia). */
    porLapso: Record<string, number | null>;
    /** El de la boleta: la media de lo que cuenta de cada materia. */
    definitivo: number | null;
}

export const mediaOficial = (valores: number[]): number | null =>
    valores.length === 0 ? null : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;

export function definitivaDeLosLapsos(lapsos: number[], redondeo: 'MPPE' | 'NINGUNO'): number | null {
    if (lapsos.length === 0) return null;
    const m = lapsos.reduce((a, b) => a + b, 0) / lapsos.length;
    return redondeo === 'MPPE' ? redondearComoElMPPE(m) : Math.round(m * 100) / 100;
}

/**
 * Las cifras oficiales de unos alumnos de UNA sección (la de ese ciclo).
 * Quien no sale en el mapa no tiene notas en esa sección.
 */
export async function cifrasOficialesDeLaSeccion(
    prisma: PrismaClient,
    instituteId: string | undefined,
    classroomId: string,
    studentIds: string[]
): Promise<Map<string, CifrasOficiales>> {
    return (await cifrasOficialesDeVariasSecciones(prisma, instituteId, [{ classroomId, studentIds }])).get(classroomId) ?? new Map();
}

/**
 * Lo mismo para varias secciones a la vez: las mismas consultas para todas
 * las del mismo ciclo (el año entero, una materia en todas sus secciones).
 * classroomId → studentId → cifras.
 */
export async function cifrasOficialesDeVariasSecciones(
    prisma: PrismaClient,
    instituteId: string | undefined,
    pedidas: Array<{ classroomId: string; studentIds: string[] }>,
    /**
     * Solo estas materias (lo que pide la pantalla de UNA materia): mucho menos
     * trabajo. Ojo: entonces `definitivo` y `porLapso` son de esas materias, no
     * el promedio del alumno; quien lo use, que mire solo las notas.
     */
    soloMaterias?: string[]
): Promise<Map<string, Map<string, CifrasOficiales>>> {
    const salida = new Map<string, Map<string, CifrasOficiales>>();
    for (const p of pedidas) salida.set(p.classroomId, new Map());
    const conAlumnos = pedidas.filter((p) => p.studentIds.length > 0);
    if (conAlumnos.length === 0) return salida;
    const secciones = await prisma.classroom.findMany({
        where: { id: { in: conAlumnos.map((p) => p.classroomId) } },
        select: {
            id: true,
            academicYearId: true,
            subjects: { select: { subject: { select: { id: true, evaluacion: true } } } },
        },
    });
    const anios = [...new Set(secciones.map((s) => s.academicYearId).filter((x): x is string => Boolean(x)))];
    if (anios.length === 0) return salida;
    const todos = [...new Set(conAlumnos.flatMap((p) => p.studentIds))];
    const liceo = instituteId ?? liceoActual();
    const [config, lapsosDeTodos, revisiones] = await Promise.all([
        // Sin liceo dicho, el de la petición; sin ninguno, las reglas de primeras.
        liceo ? getAcademicConfig(liceo) : Promise.resolve({ ...DEFAULT_ACADEMIC_CONFIG }),
        prisma.period.findMany({
            where: { academicYearId: { in: anios } },
            select: { id: true, academicYearId: true },
            orderBy: { startDate: 'asc' },
        }),
        (prisma as any).notaDeRevision.findMany({
            where: { studentId: { in: todos }, academicYearId: { in: anios } },
            select: { studentId: true, subjectId: true, score: true, academicYearId: true },
        }) as Promise<Array<{ studentId: string; subjectId: string; score: number; academicYearId: string }>>,
    ]);
    const redondeo = config.redondeoDeDefinitivas ?? 'MPPE';
    const notaMinima = config.notaMinimaAprobatoria;
    const redondear = (n: number) => (redondeo === 'MPPE' ? redondearComoElMPPE(n) : n);
    const revisionDe = new Map(revisiones.map((r) => [`${r.academicYearId}|${r.studentId}|${r.subjectId}`, r.score]));
    const alumnosDe = new Map(conAlumnos.map((p) => [p.classroomId, p.studentIds]));

    // Una pasada por ciclo, para todos sus lapsos y todas sus secciones.
    for (const anio of anios) {
        const delAnio = secciones.filter((s) => s.academicYearId === anio);
        const lapsos = lapsosDeTodos.filter((l) => l.academicYearId === anio);
        const cuantitativasDe = new Map(
            delAnio.map((s) => [
                s.id,
                s.subjects
                    .map((x) => x.subject)
                    .filter((m) => m.evaluacion !== 'CUALITATIVA' && (!soloMaterias || soloMaterias.includes(m.id)))
                    .map((m) => m.id),
            ])
        );
        const notasDe = lapsos.length > 0
            ? await bulkNotasPorLapsoDeVariasSecciones(
                prisma,
                delAnio.map((s) => ({ classroomId: s.id, studentIds: alumnosDe.get(s.id) ?? [], subjectIds: cuantitativasDe.get(s.id) ?? [] }))
            )
            : new Map();
        for (const seccion of delAnio) {
            const cuantitativas = cuantitativasDe.get(seccion.id) ?? [];
            const deLaSeccion = notasDe.get(seccion.id);
            const mapa = salida.get(seccion.id)!;
            for (const sid of alumnosDe.get(seccion.id) ?? []) {
                const materias = new Map<string, NotaOficialDeLaMateria>();
                for (const m of cuantitativas) {
                    const notas: Record<string, number | null> = {};
                    const validas: number[] = [];
                    for (const l of lapsos) {
                        const dato = deLaSeccion?.get(sid)?.get(m)?.get(l.id);
                        if (dato !== undefined) {
                            const r = redondear(dato);
                            notas[l.id] = r;
                            validas.push(r);
                        } else notas[l.id] = null;
                    }
                    const definitiva = definitivaDeLosLapsos(validas, redondeo);
                    const revision = definitiva !== null && definitiva < notaMinima ? (revisionDe.get(`${anio}|${sid}|${m}`) ?? null) : null;
                    materias.set(m, { notas, definitiva, revision, queCuenta: revision ?? definitiva });
                }
                const lapsoMedia: Record<string, number | null> = {};
                for (const l of lapsos) {
                    lapsoMedia[l.id] = mediaOficial([...materias.values()].map((x) => x.notas[l.id]).filter((n): n is number => n !== null));
                }
                mapa.set(sid, {
                    materias,
                    porLapso: lapsoMedia,
                    definitivo: mediaOficial([...materias.values()].map((x) => x.queCuenta).filter((n): n is number => n !== null)),
                });
            }
        }
    }
    return salida;
}

/** El promedio que se enseña: el del lapso pedido, o el definitivo. */
export function promedioOficial(c: CifrasOficiales | undefined, periodId?: string | null): number | null {
    if (!c) return null;
    return periodId ? (c.porLapso[periodId] ?? null) : c.definitivo;
}

/** La nota de una materia que se enseña: la del lapso pedido, o la que cuenta. */
export function notaOficial(c: CifrasOficiales | undefined, subjectId: string, periodId?: string | null): number | null {
    const m = c?.materias.get(subjectId);
    if (!m) return null;
    return periodId ? (m.notas[periodId] ?? null) : m.queCuenta;
}

/**
 * La asistencia de varios alumnos en una ventana de fechas, en UNA consulta:
 * (presentes + tardanzas) / registros, como en todas partes (MAPA §3).
 */
export async function asistenciaEnBloque(
    prisma: PrismaClient,
    studentIds: string[],
    ventana: { desde?: Date | null; hasta?: Date | null }
): Promise<Map<string, { porcentaje: number; registros: number }>> {
    const salida = new Map<string, { porcentaje: number; registros: number }>();
    if (studentIds.length === 0) return salida;
    const fecha: Record<string, Date> = {};
    if (ventana.desde) fecha.gte = ventana.desde;
    if (ventana.hasta) fecha.lte = ventana.hasta;
    const filas = await prisma.dailyAttendance.groupBy({
        by: ['studentId', 'status'],
        where: { studentId: { in: studentIds }, ...(Object.keys(fecha).length ? { date: fecha } : {}) },
        _count: { _all: true },
    });
    for (const f of filas) {
        const a = salida.get(f.studentId) ?? { porcentaje: 0, registros: 0, presentes: 0 } as any;
        a.registros += f._count._all;
        if (f.status === 'PRESENT' || f.status === 'LATE') a.presentes += f._count._all;
        salida.set(f.studentId, a);
    }
    for (const [k, a] of salida as Map<string, any>) {
        salida.set(k, { porcentaje: a.registros > 0 ? (a.presentes * 100) / a.registros : 0, registros: a.registros });
    }
    return salida;
}

/**
 * En riesgo, con la cifra oficial: alguna materia por debajo de la mínima, o
 * el promedio por debajo (MAPA §3). La misma regla en la sección, el año y el
 * Inicio del admin.
 */
export function estaEnRiesgo(c: CifrasOficiales | undefined, notaMinima: number, periodId?: string | null): { enRiesgo: boolean; reprobadas: number } {
    const promedio = promedioOficial(c, periodId);
    if (!c || promedio === null) return { enRiesgo: false, reprobadas: 0 };
    const reprobadas = [...c.materias.values()].filter((m) => {
        const n = periodId ? m.notas[periodId] : m.queCuenta;
        return n !== null && n !== undefined && n < notaMinima;
    }).length;
    return { enRiesgo: reprobadas > 0 || promedio < notaMinima, reprobadas };
}

/** Las cifras oficiales de todo un año escolar, sección por sección y a la vez. */
export async function cifrasOficialesDelAno(
    prisma: PrismaClient,
    instituteId: string | undefined,
    academicYearId: string
): Promise<Array<{ classroomId: string; grade: number; oficiales: Map<string, CifrasOficiales> }>> {
    const [secciones, inscritos] = await Promise.all([
        prisma.classroom.findMany({ where: { academicYearId }, select: { id: true, grade: true } }),
        prisma.studentClassroom.findMany({ where: { academicYearId, isActive: true }, select: { studentId: true, classroomId: true } }),
    ]);
    const alumnosDe = new Map<string, string[]>();
    for (const i of inscritos) alumnosDe.set(i.classroomId, [...(alumnosDe.get(i.classroomId) ?? []), i.studentId]);
    const todas = await cifrasOficialesDeVariasSecciones(prisma, instituteId, secciones.map((s) => ({ classroomId: s.id, studentIds: alumnosDe.get(s.id) ?? [] })));
    return secciones.map((s) => ({ classroomId: s.id, grade: s.grade, oficiales: todas.get(s.id) ?? new Map() }));
}
