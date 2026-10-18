import { AppErrors } from '../middleware/error.middleware';
import { promediosDeLaSeccion } from './aggregation.service';
import { cargaDeLosProfesores, estadoDeLaCarga, horasDeCargoDe, reglasDeCargaHoraria, type ClaseDeLaCarga } from './personal.service';

/**
 * LOS PROFESORES, EN UN SOLO SITIO (Cristian, 18-oct-2026)
 *
 * Para el admin: cuántas horas lleva cada profesor frente a las de su cargo,
 * en qué secciones y con qué materias, su promedio (el de sus alumnos) y la
 * asistencia de sus secciones; y las clases que siguen sin profesor.
 *
 *   - La carga: `cargaDeLosProfesores` (una sola cuenta, `MAPA` §1e).
 *   - El promedio de una clase: el de sus alumnos en esa materia, en bloque
 *     por sección (`promediosDeLaSeccion`), el año entero; el del profesor, la
 *     media de los de todos sus alumnos (como en Materias, `MAPA` §1d).
 *   - La asistencia: la de la sección (asistió = presente o tarde).
 *
 * Todo del admin (`routes/profesores.routes.ts`). Pruebas: PROF-05…
 */

const nombre = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const clave = (classroomId: string, subjectId: string) => `${classroomId}|${subjectId}`;

/** Las notas (promedio de cada alumno) de cada clase, en bloque: una pasada por sección. */
async function notasDeLasClases(prisma: any, clases: Array<{ classroomId: string; subjectId: string }>) {
    const porSeccion = new Map<string, Set<string>>();
    for (const c of clases) porSeccion.set(c.classroomId, (porSeccion.get(c.classroomId) ?? new Set()).add(c.subjectId));
    const notas = new Map<string, number[]>();
    await Promise.all(
        [...porSeccion.entries()].map(async ([classroomId, materias]) => {
            const promedios = await promediosDeLaSeccion(prisma, classroomId, undefined, [...materias]);
            for (const subjectId of materias) {
                const xs: number[] = [];
                for (const porMateria of promedios.values()) {
                    const p = porMateria.get(subjectId) ?? 0;
                    if (p > 0) xs.push(p);
                }
                notas.set(clave(classroomId, subjectId), xs);
            }
        })
    );
    return notas;
}

/** Asistió / tomadas de cada sección. */
async function asistenciaDeLasSecciones(prisma: any, classroomIds: string[]) {
    const grupos = classroomIds.length
        ? await prisma.dailyAttendance.groupBy({ by: ['classroomId', 'status'], where: { classroomId: { in: classroomIds } }, _count: { id: true } })
        : [];
    const porSeccion = new Map<string, { asistio: number; total: number }>();
    for (const g of grupos as any[]) {
        const e = porSeccion.get(g.classroomId) ?? { asistio: 0, total: 0 };
        e.total += g._count.id;
        if (g.status === 'PRESENT' || g.status === 'LATE') e.asistio += g._count.id;
        porSeccion.set(g.classroomId, e);
    }
    return porSeccion;
}
const porcentaje = (e?: { asistio: number; total: number }) => (e && e.total > 0 ? Math.round((e.asistio / e.total) * 100) : null);

/** Las clases sin profesor del año en curso (las materias «por grupos» no llevan uno por sección). */
const DONDE_FALTA_PROFESOR = { teacherId: null, classroom: { academicYear: { status: 'ACTIVE' } }, subject: { porGrupos: false } };

export async function losProfesores(prisma: any, instituteId: string) {
    const [profes, reglas, cargas, clasesSinProfesor] = await Promise.all([
        prisma.user.findMany({
            where: { role: 'TEACHER', isActive: true },
            select: { id: true, firstName: true, lastName: true, avatar: true, horasDelCargo: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        }),
        reglasDeCargaHoraria(instituteId),
        cargaDeLosProfesores(prisma, instituteId),
        prisma.classroomSubject.count({ where: DONDE_FALTA_PROFESOR }),
    ]);
    const todas: ClaseDeLaCarga[] = [...cargas.values()].flatMap((c) => c.filas);
    const notas = await notasDeLasClases(prisma, todas);

    const lista = profes.map((p: any) => {
        const carga = cargas.get(p.id) ?? { filas: [], total: 0, bloques: 0, sinHoras: 0 };
        const suyas = carga.filas.flatMap((f) => notas.get(clave(f.classroomId, f.subjectId)) ?? []);
        return {
            id: p.id,
            nombre: nombre(p),
            avatar: p.avatar ?? null,
            horas: carga.total,
            sinHoras: carga.sinHoras,
            horasDelCargo: p.horasDelCargo ?? null,
            cargo: horasDeCargoDe(reglas, p.horasDelCargo),
            estado: estadoDeLaCarga(carga.total, reglas, p.horasDelCargo),
            clases: carga.filas.length,
            secciones: new Set(carga.filas.map((f) => f.classroomId)).size,
            promedio: media(suyas),
        };
    });
    return { reglas, clasesSinProfesor, profesores: lista };
}

export async function elProfesor(prisma: any, instituteId: string, teacherId: string) {
    const p = await prisma.user.findUnique({
        where: { id: teacherId },
        select: { id: true, firstName: true, lastName: true, avatar: true, role: true, horasDelCargo: true, specialization: true, joinDate: true },
    });
    if (!p || p.role !== 'TEACHER') throw AppErrors.NotFound('Profesor');
    const [reglas, cargas, guia] = await Promise.all([
        reglasDeCargaHoraria(instituteId),
        cargaDeLosProfesores(prisma, instituteId, [teacherId]),
        prisma.classroom.findMany({
            where: { teacherId, academicYear: { status: 'ACTIVE' } },
            select: { id: true, name: true },
            orderBy: [{ grade: 'asc' }, { name: 'asc' }],
        }),
    ]);
    const carga = cargas.get(teacherId)!;
    const [notas, asistencia] = await Promise.all([
        notasDeLasClases(prisma, carga.filas),
        asistenciaDeLasSecciones(prisma, [...new Set(carga.filas.map((f) => f.classroomId))]),
    ]);

    const clases = carga.filas.map((f) => ({
        ...f,
        promedio: media(notas.get(clave(f.classroomId, f.subjectId)) ?? []),
        asistencia: porcentaje(asistencia.get(f.classroomId)),
    }));

    // Por materia: todas sus secciones juntas.
    const materias = new Map<string, { subjectId: string; materia: string; secciones: number; horas: number; notas: number[] }>();
    for (const f of carga.filas) {
        const m = materias.get(f.subjectId) ?? { subjectId: f.subjectId, materia: f.materia, secciones: 0, horas: 0, notas: [] };
        m.secciones += 1;
        m.horas = Math.round((m.horas + (f.horas ?? 0)) * 100) / 100;
        m.notas.push(...(notas.get(clave(f.classroomId, f.subjectId)) ?? []));
        materias.set(f.subjectId, m);
    }
    const asistenciaTotal = [...asistencia.values()].reduce((t, e) => ({ asistio: t.asistio + e.asistio, total: t.total + e.total }), { asistio: 0, total: 0 });

    return {
        profesor: {
            id: p.id,
            nombre: nombre(p),
            avatar: p.avatar ?? null,
            especialidad: p.specialization ?? null,
            ingreso: p.joinDate ? p.joinDate.toISOString().slice(0, 10) : null,
        },
        guiaDe: guia.map((c: any) => ({ id: c.id, nombre: c.name })),
        reglas,
        horas: carga.total,
        bloques: carga.bloques,
        sinHoras: carga.sinHoras,
        horasDelCargo: p.horasDelCargo ?? null,
        cargo: horasDeCargoDe(reglas, p.horasDelCargo),
        estado: estadoDeLaCarga(carga.total, reglas, p.horasDelCargo),
        promedio: media(clases.flatMap((c) => notas.get(clave(c.classroomId, c.subjectId)) ?? [])),
        asistencia: porcentaje(asistenciaTotal),
        clases,
        porMateria: [...materias.values()]
            .map(({ notas: xs, ...m }) => ({ ...m, promedio: media(xs) }))
            .sort((a, b) => a.materia.localeCompare(b.materia, 'es')),
    };
}

/** Las clases sin profesor del año en curso, por año y sección. */
export async function clasesSinProfesor(prisma: any) {
    const filas = await prisma.classroomSubject.findMany({
        where: DONDE_FALTA_PROFESOR,
        select: {
            id: true,
            weeklyBlocks: true,
            hoursPerWeek: true,
            subject: { select: { id: true, name: true, slug: true } },
            classroom: { select: { id: true, name: true, slug: true, grade: true, shift: true } },
        },
    });
    return filas
        .map((c: any) => ({
            claseId: c.id,
            classroomId: c.classroom.id,
            seccion: c.classroom.name,
            seccionSlug: c.classroom.slug,
            grado: c.classroom.grade,
            turno: c.classroom.shift,
            subjectId: c.subject.id,
            subjectSlug: c.subject.slug,
            materia: c.subject.name,
            bloques: c.weeklyBlocks || null,
        }))
        .sort((a: any, b: any) => a.grado - b.grado || a.seccion.localeCompare(b.seccion, 'es') || a.materia.localeCompare(b.materia, 'es'));
}
