import { RedisCache } from '../config/redis';
import { bulkSubjectAveragesConDatos } from './bulk-averages.service';
import { claveDelPromedioDelLapso, DURACION_DEL_PROMEDIO_DEL_LAPSO } from './grades.service';

/**
 * LOS PROMEDIOS DEL AÑO, EN BLOQUE, ANTES DE LA DESCARGA (2026-10-06)
 *
 * La primera descarga del admin pide ~9.500 lecturas, y las más caras son las
 * que calculan promedios alumno por alumno: el Inicio de cada alumno (dos
 * veces, 599 × ~170 ms), su boleta (599 × ~110 ms) y la revisión (300 × ~210
 * ms). Cada una llama a `gradesService.promedioDelLapso` por materia y lapso,
 * con sus consultas, y eso era casi la mitad de la descarga.
 *
 * Aquí se calcula todo el año de una vez, por sección y lapso, con
 * `bulkSubjectAveragesConDatos` (las mismas reglas: su paridad la vigila
 * `bulk-averages-parity.test.ts`, y medida con los datos del instituto de
 * pruebas: 0 diferencias en 26.955 promedios), y se deja en la memoria rápida
 * con la MISMA llave y la misma duración que usa `promedioDelLapso`. Las
 * lecturas de la descarga lo encuentran hecho. No cambia ningún número:
 * cambiar una nota borra esas llaves igual que siempre.
 *
 * Una vez cada pocos minutos por liceo y alcance: la descarga entera cabe de
 * sobra en lo que dura lo guardado.
 */

const CADA = 4 * 60 * 1000;
/** liceo|alcance → cuándo se precalentó (MEZCLA-08: la llave es el liceo). */
const PRECALENTADO = new Map<string, number>();

export interface Alcance {
    /** Solo estas secciones (el profesor); sin esto, todas las del año (el admin). */
    secciones?: string[];
}

export async function precalentarLosPromedios(
    prisma: any,
    liceo: string,
    alcance: Alcance = {}
): Promise<{ promedios: number; ms: number } | null> {
    const llave = `${liceo}|${alcance.secciones ? [...alcance.secciones].sort().join(',') : 'todo'}`;
    const antes = PRECALENTADO.get(llave);
    if (antes && Date.now() - antes < CADA) return null;
    PRECALENTADO.set(llave, Date.now());
    if (PRECALENTADO.size > 2000) PRECALENTADO.delete(PRECALENTADO.keys().next().value as string);

    const inicio = Date.now();
    const ano = await prisma.academicYear.findFirst({
        where: { OR: [{ isActive: true }, { status: 'ACTIVE' }] },
        select: { id: true },
    });
    if (!ano) return { promedios: 0, ms: Date.now() - inicio };
    const [lapsos, secciones] = await Promise.all([
        prisma.period.findMany({ where: { academicYearId: ano.id }, select: { id: true } }),
        prisma.classroom.findMany({
            where: { academicYearId: ano.id, ...(alcance.secciones ? { id: { in: alcance.secciones } } : {}) },
            select: {
                id: true,
                studentClassrooms: { where: { isActive: true }, select: { studentId: true } },
                subjects: { select: { subjectId: true } },
            },
        }),
    ]);

    const trabajos: Array<{ seccion: string; alumnos: string[]; materias: string[]; lapso: string }> = [];
    for (const s of secciones) {
        const alumnos = s.studentClassrooms.map((x: { studentId: string }) => x.studentId);
        const materias = [...new Set(s.subjects.map((x: { subjectId: string }) => x.subjectId))] as string[];
        if (!alumnos.length || !materias.length) continue;
        for (const l of lapsos) trabajos.push({ seccion: s.id, alumnos, materias, lapso: l.id });
    }

    const entradas: Array<[string, unknown]> = [];
    // De cuatro en cuatro: cada una son unas pocas consultas grandes.
    for (let i = 0; i < trabajos.length; i += 4) {
        const hechos = await Promise.all(
            trabajos.slice(i, i + 4).map(async (t) => ({
                t,
                r: await bulkSubjectAveragesConDatos(prisma, { classroomId: t.seccion, studentIds: t.alumnos, subjectIds: t.materias, periodId: t.lapso }),
            }))
        );
        for (const { t, r } of hechos) {
            r.forEach((materias, alumno) => {
                materias.forEach((detalle, materia) => {
                    entradas.push([claveDelPromedioDelLapso(alumno, materia, t.lapso), detalle]);
                });
            });
        }
    }
    await RedisCache.setMany(entradas, DURACION_DEL_PROMEDIO_DEL_LAPSO);
    return { promedios: entradas.length, ms: Date.now() - inicio };
}

/** Las secciones del profesor: las que guía y en las que da alguna materia. */
export async function lasSeccionesDelProfesor(prisma: any, profesorId: string): Promise<string[]> {
    const [guia, imparte] = await Promise.all([
        prisma.classroom.findMany({ where: { teacherId: profesorId }, select: { id: true } }),
        prisma.classroomSubject.findMany({ where: { teacherId: profesorId }, select: { classroomId: true } }),
    ]);
    return [...new Set([...guia.map((c: { id: string }) => c.id), ...imparte.map((c: { classroomId: string }) => c.classroomId)])];
}

/** Para las pruebas. */
export function olvidarElPrecalentado(): void {
    PRECALENTADO.clear();
}
