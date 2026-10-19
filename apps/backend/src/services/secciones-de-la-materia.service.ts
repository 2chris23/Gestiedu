import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia, type QuienBorra } from '../utils/papelera';
import { horasDeLosBloques } from './personal.service';

/**
 * EN QUÉ SECCIONES SE DA UNA MATERIA (Cristian, 18-oct-2026)
 *
 * Se decide desde Materias, por año: «Castellano en todo 1.º menos 1.º C».
 * Antes se añadía sección por sección desde cada sección. La sección ya no
 * edita sus materias; la clase (`classroom_subjects`) nace SIN profesor y se
 * le asigna en Profesores o en la materia.
 *
 *   - Poner: crea las clases que faltan con sus bloques; las horas salen de la
 *     hora de clase del turno de cada sección (`horasDeLosBloques`).
 *   - Quitar: solo una clase sin trabajo. Con notas, actividades, plan o
 *     apreciaciones: 409 `CLASE_CON_TRABAJO`, y no se quita NADA. Sin trabajo,
 *     a la papelera (`borrarGuardandoCopia`).
 *   - Una sección nueva recibe las materias de su año (las de sus hermanas
 *     del mismo año y grado), sin profesor: `materiasDeSuAno`.
 *
 * Pruebas: SECC-MAT-01…
 */

export interface SeccionDondeSeDa {
    id: string;
    nombre: string;
    turno: string;
    laTiene: boolean;
    bloques: number | null;
    profesor: string | null;
}

export async function dondeSeDa(prisma: any, subjectId: string, academicYearId: string) {
    const [materia, secciones] = await Promise.all([
        prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true, porGrupos: true } }),
        prisma.classroom.findMany({
            where: { academicYearId, isActive: true },
            select: {
                id: true,
                name: true,
                grade: true,
                shift: true,
                subjects: {
                    where: { subjectId },
                    select: { weeklyBlocks: true, teacher: { select: { firstName: true, lastName: true } } },
                },
            },
            orderBy: [{ grade: 'asc' }, { name: 'asc' }],
        }),
    ]);
    if (!materia) throw createError(404, 'Materia no encontrada', 'SUBJECT_NOT_FOUND');
    const anos = new Map<number, SeccionDondeSeDa[]>();
    for (const s of secciones as any[]) {
        const cs = s.subjects[0];
        anos.set(s.grade, [
            ...(anos.get(s.grade) ?? []),
            {
                id: s.id,
                nombre: s.name,
                turno: s.shift,
                laTiene: Boolean(cs),
                bloques: cs ? cs.weeklyBlocks || null : null,
                profesor: cs?.teacher ? `${cs.teacher.firstName} ${cs.teacher.lastName}` : null,
            },
        ]);
    }
    return {
        materia,
        anos: [...anos.entries()].sort(([a], [b]) => a - b).map(([grado, lista]) => ({ grado, secciones: lista })),
    };
}

/** Las clases (sección + materia) que ya tienen trabajo: no se quitan. */
export async function conTrabajo(prisma: any, subjectId: string, classroomIds: string[]) {
    if (!classroomIds.length) return new Set<string>();
    const [actividades, plan, apreciaciones, inscritos] = await Promise.all([
        prisma.classActivity.groupBy({ by: ['classroomId'], where: { subjectId, classroomId: { in: classroomIds } } }),
        prisma.evaluationPlanRow.groupBy({ by: ['classroomId'], where: { subjectId, classroomId: { in: classroomIds } } }),
        prisma.apreciacion.groupBy({ by: ['classroomId'], where: { subjectId, classroomId: { in: classroomIds } } }),
        prisma.studentClassroom.findMany({ where: { classroomId: { in: classroomIds } }, select: { classroomId: true, studentId: true } }),
    ]);
    const con = new Set<string>([...actividades, ...plan, ...apreciaciones].map((g: any) => g.classroomId));
    // Las notas no llevan sección: las de sus alumnos en esta materia.
    const alumnos = [...new Set((inscritos as any[]).map((i) => i.studentId))];
    if (alumnos.length) {
        const conNota = await prisma.grade.groupBy({ by: ['studentId'], where: { subjectId, studentId: { in: alumnos } } });
        const conNotaSet = new Set((conNota as any[]).map((g) => g.studentId));
        for (const i of inscritos as any[]) if (conNotaSet.has(i.studentId)) con.add(i.classroomId);
    }
    return con;
}

/**
 * Por cualquier puerta que se quite una clase, la misma regla: con notas,
 * actividades, plan o apreciaciones, 409 y no se quita NADA (VIEJA-01).
 */
export async function noQuitarConTrabajo(prisma: any, subjectId: string, classroomIds: string[]): Promise<void> {
    const ocupadas = await conTrabajo(prisma, subjectId, classroomIds);
    if (!ocupadas.size) return;
    const nombres = (await prisma.classroom.findMany({ where: { id: { in: [...ocupadas] } }, select: { name: true } })).map((s: any) => s.name);
    throw createError(409, `No se puede quitar de ${nombres.join(', ')}: ya tiene notas, actividades o plan`, 'CLASE_CON_TRABAJO');
}

export async function ponerEnSecciones(
    prisma: any,
    instituteId: string,
    subjectId: string,
    d: { academicYearId: string; poner: Array<{ classroomId: string; weeklyBlocks: number }>; quitar: string[] },
    quien: QuienBorra = {}
) {
    const materia = await prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
    if (!materia) throw createError(404, 'Materia no encontrada', 'SUBJECT_NOT_FOUND');
    const ids = [...new Set([...d.poner.map((p) => p.classroomId), ...d.quitar])];
    const secciones = await prisma.classroom.findMany({ where: { id: { in: ids }, academicYearId: d.academicYearId }, select: { id: true, name: true, shift: true } });
    if (secciones.length !== ids.length) throw createError(400, 'Hay secciones que no son de ese año', 'SECCION_DE_OTRO_ANO');
    const porId = new Map<string, any>(secciones.map((s: any) => [s.id, s]));

    // Quitar: primero mirar que ninguna tenga trabajo; si una lo tiene, nada.
    const yaEstan = await prisma.classroomSubject.findMany({ where: { subjectId, classroomId: { in: ids } }, select: { classroomId: true } });
    const estan = new Set((yaEstan as any[]).map((c) => c.classroomId));
    const aQuitar = d.quitar.filter((id) => estan.has(id));
    const ocupadas = await conTrabajo(prisma, subjectId, aQuitar);
    if (ocupadas.size) {
        const nombres = [...ocupadas].map((id) => porId.get(id)?.name).filter(Boolean);
        throw createError(409, `No se puede quitar de ${nombres.join(', ')}: ya tiene notas, actividades o plan`, 'CLASE_CON_TRABAJO');
    }

    const nuevas = await Promise.all(
        d.poner
            .filter((p) => !estan.has(p.classroomId))
            .map(async (p) => {
                const bloques = Math.max(0, Math.min(40, Math.round(p.weeklyBlocks || 0)));
                return {
                    classroomId: p.classroomId,
                    subjectId,
                    weeklyBlocks: bloques,
                    hoursPerWeek: await horasDeLosBloques(instituteId, porId.get(p.classroomId)?.shift, bloques),
                };
            })
    );
    if (nuevas.length) await prisma.classroomSubject.createMany({ data: nuevas, skipDuplicates: true });
    const quitadas = aQuitar.length ? await borrarGuardandoCopia(prisma, 'classroomSubject', { subjectId, classroomId: { in: aQuitar } }, quien) : 0;
    return { puestas: nuevas.length, quitadas };
}

/**
 * Una sección nueva recibe las materias de su año: las que tienen sus
 * hermanas (mismo año escolar y grado), con los bloques de la primera que la
 * tenga, sin profesor.
 */
export async function materiasDeSuAno(prisma: any, instituteId: string, classroomId: string) {
    const s = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { id: true, grade: true, shift: true, academicYearId: true } });
    if (!s?.academicYearId) return 0;
    const hermanas = await prisma.classroomSubject.findMany({
        where: { classroom: { academicYearId: s.academicYearId, grade: s.grade, id: { not: s.id } } },
        select: { subjectId: true, weeklyBlocks: true },
        orderBy: { createdAt: 'asc' },
    });
    const porMateria = new Map<string, number>();
    for (const h of hermanas as any[]) if (!porMateria.has(h.subjectId)) porMateria.set(h.subjectId, h.weeklyBlocks || 0);
    if (!porMateria.size) return 0;
    const data = await Promise.all(
        [...porMateria.entries()].map(async ([subjectId, weeklyBlocks]) => ({
            classroomId: s.id,
            subjectId,
            weeklyBlocks,
            hoursPerWeek: await horasDeLosBloques(instituteId, s.shift, weeklyBlocks),
        }))
    );
    const r = await prisma.classroomSubject.createMany({ data, skipDuplicates: true });
    return r.count;
}
