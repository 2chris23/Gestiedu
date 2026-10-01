import { PrismaClient } from '@prisma/client';
import { gradesService, redondearComoElMPPE } from './grades.service';
import { getAcademicConfig } from './promotion/close-cycle.service';
import { createError } from '../middleware/error.middleware';

/**
 * LA REVISIÓN DE UNA MATERIA REPROBADA
 *
 * En un liceo venezolano, al terminar el tercer lapso el alumno que reprobó
 * una materia la presenta en **revisión** (finales de julio). La nota de la
 * revisión es su definitiva: si aprueba, la materia deja de contar como
 * reprobada para la promoción; si no, pasa con la materia pendiente (si no
 * supera el tope del liceo) o repite.
 *
 * Gestiedu tenía el tope de pendientes y el acta de compromiso, pero ninguna
 * forma de registrar la revisión: el alumno que la aprobaba seguía saliendo
 * «con pendientes» al cerrar el ciclo.
 *
 *   - Se registra ANTES de cerrar el ciclo (con el ciclo cerrado: 409).
 *   - Solo para una materia de su sección que el alumno REPROBÓ con notas
 *     (sin notas no hay nada que revisar; aprobada, tampoco): 409.
 *   - Una por alumno, materia y ciclo; volver a guardarla la corrige (así un
 *     doble clic no deja dos).
 *   - La nota va de 0 a 20 y se redondea como las definitivas del liceo.
 *   - Si el liceo divide la revisión (`academicConfig.revision.componentes`,
 *     p. ej. 30 % actividades + 70 % prueba), llega cada parte con su nota y
 *     la de la revisión es la suma ponderada. Con una sola parte, la nota.
 *   - Si el liceo pone tope (`revision.maxMaterias`), quien reprobó más
 *     materias que eso no va a revisión: 409 FUERA_DE_REVISION.
 *   - La pone el PROFESOR de esa materia en la sección del alumno, o el admin
 *     (control de estudios) que corrige (lo decide el controlador).
 *
 * El cierre la usa en `prepareClose` (`definitivaConRevision`). Pruebas:
 * `tests/integration/funcional-revision.test.ts` (REV-01…06).
 */

export const NOTA_MAXIMA = 20;

const redondear = (n: number, redondeo: 'MPPE' | 'NINGUNO' | undefined) =>
    redondeo === 'NINGUNO' ? Math.round(n * 100) / 100 : redondearComoElMPPE(n);

/** Las revisiones de un ciclo, por «alumno|materia». */
export async function revisionesDelCiclo(prisma: any, academicYearId: string): Promise<Map<string, number>> {
    const filas = await prisma.notaDeRevision.findMany({
        where: { academicYearId },
        select: { studentId: true, subjectId: true, score: true },
    });
    return new Map(filas.map((f: any) => [`${f.studentId}|${f.subjectId}`, f.score]));
}

export async function registrarRevision(
    prisma: PrismaClient,
    instituteId: string,
    datos: {
        academicYearId: string;
        studentId: string;
        subjectId: string;
        score?: number;
        /** Las partes de la revisión con su nota, si el liceo la divide. */
        componentes?: Array<{ nombre: string; nota: number }>;
        fecha: string;
        observaciones?: string | null;
        registradaPor: string;
    }
) {
    const esNota = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= NOTA_MAXIMA;
    const config = await getAcademicConfig(instituteId);
    const partes = config.revision.componentes;

    // La nota de la revisión: la suma ponderada de sus partes, o la nota sola.
    let conPartes: Array<{ nombre: string; peso: number; nota: number }> | null = null;
    let nota: number;
    if (Array.isArray(datos.componentes) && datos.componentes.length > 0) {
        conPartes = partes.map((p) => {
            const dada = datos.componentes!.find((c) => c?.nombre?.trim().toLowerCase() === p.nombre.toLowerCase());
            if (!dada || !esNota(dada.nota)) {
                throw createError(400, `Falta la nota de «${p.nombre}» (de 0 a ${NOTA_MAXIMA})`, 'NOTA_INVALIDA');
            }
            return { nombre: p.nombre, peso: p.peso, nota: dada.nota };
        });
        nota = conPartes.reduce((suma, p) => suma + (p.nota * p.peso) / 100, 0);
    } else if (partes.length > 1) {
        throw createError(400, `La revisión del liceo tiene ${partes.length} partes: hace falta la nota de cada una`, 'NOTA_INVALIDA');
    } else {
        if (!esNota(datos.score)) throw createError(400, `La nota de revisión va de 0 a ${NOTA_MAXIMA}`, 'NOTA_INVALIDA');
        nota = datos.score;
    }
    const ciclo = await prisma.academicYear.findUnique({ where: { id: datos.academicYearId }, select: { id: true, status: true } });
    if (!ciclo) throw createError(404, 'Año escolar no encontrado', 'NOT_FOUND');
    if (ciclo.status === 'COMPLETED') {
        throw createError(409, 'El año escolar ya se cerró: la revisión se registra antes del cierre', 'CICLO_CERRADO');
    }

    const inscripcion = await prisma.studentClassroom.findUnique({
        where: { studentId_academicYearId: { studentId: datos.studentId, academicYearId: datos.academicYearId } },
        select: { classroom: { select: { subjects: { where: { subjectId: datos.subjectId }, select: { subjectId: true } } } } },
    });
    if (!inscripcion) throw createError(404, 'El estudiante no está inscrito en ese año escolar', 'NOT_FOUND');
    if (inscripcion.classroom.subjects.length === 0) {
        throw createError(409, 'Esa materia no es de la sección del estudiante', 'MATERIA_AJENA');
    }

    // Con los lapsos de ESE año (no los de la inscripción activa, que tras
    // cerrar puede ser la del año siguiente).
    const lapsos = await lapsosDelAno(prisma, datos.academicYearId);
    const def = await gradesService.promedioDeLaMateria(
        prisma, datos.studentId, datos.subjectId, undefined, lapsos, config.redondeoDeDefinitivas
    );
    if (!def.conNotas) {
        throw createError(409, 'La materia no tiene notas: no hay nada que revisar', 'SIN_NOTAS');
    }
    if (def.promedio >= config.notaMinimaAprobatoria) {
        throw createError(409, 'La materia está aprobada: solo se revisa una materia reprobada', 'NO_REPROBADA');
    }

    // Con tope de materias en revisión: quien reprobó más, repite sin revisión.
    if (config.revision.maxMaterias !== null) {
        const reprobadas = await reprobadasDelAlumno(prisma, datos.studentId, datos.academicYearId, config);
        if (reprobadas > config.revision.maxMaterias) {
            throw createError(
                409,
                `Reprobó ${reprobadas} materias y el liceo admite revisión hasta ${config.revision.maxMaterias}`,
                'FUERA_DE_REVISION'
            );
        }
    }

    const score = redondear(nota, config.redondeoDeDefinitivas);
    const fecha = new Date(`${datos.fecha}T00:00:00.000Z`);
    return (prisma as any).notaDeRevision.upsert({
        where: {
            studentId_subjectId_academicYearId: {
                studentId: datos.studentId,
                subjectId: datos.subjectId,
                academicYearId: datos.academicYearId,
            },
        },
        update: { score, fecha, observaciones: datos.observaciones ?? null, registradaPor: datos.registradaPor, componentes: conPartes ?? undefined },
        create: {
            studentId: datos.studentId,
            subjectId: datos.subjectId,
            academicYearId: datos.academicYearId,
            score,
            fecha,
            observaciones: datos.observaciones ?? null,
            registradaPor: datos.registradaPor,
            componentes: conPartes ?? undefined,
        },
    });
}

async function lapsosDelAno(prisma: any, academicYearId: string): Promise<string[]> {
    return (await prisma.period.findMany({ where: { academicYearId }, select: { id: true } })).map((p: any) => p.id);
}

/** Cuántas materias con nota reprobó el alumno en el año (sin contar la revisión). */
async function reprobadasDelAlumno(prisma: any, studentId: string, academicYearId: string, config: any): Promise<number> {
    const inscripcion = await prisma.studentClassroom.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId } },
        select: { classroom: { select: { subjects: { select: { subjectId: true } } } } },
    });
    let n = 0;
    const lapsos = await lapsosDelAno(prisma, academicYearId);
    for (const m of inscripcion?.classroom.subjects ?? []) {
        const d = await gradesService.promedioDeLaMateria(prisma, studentId, m.subjectId, undefined, lapsos, config.redondeoDeDefinitivas);
        if (d.conNotas && d.promedio < config.notaMinimaAprobatoria) n++;
    }
    return n;
}

/**
 * La lista de revisión de UNA materia en UNA sección, para su profesor: los
 * alumnos que la reprobaron en el año, con su revisión si ya la tienen.
 */
export async function revisionDeLaMateria(prisma: any, instituteId: string, classroomId: string, subjectId: string) {
    const seccion = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: {
            id: true,
            name: true,
            academicYearId: true,
            academicYear: { select: { status: true } },
            subjects: { where: { subjectId }, select: { subject: { select: { id: true, name: true, evaluacion: true } } } },
            studentClassrooms: {
                where: { isActive: true },
                select: { student: { select: { id: true, firstName: true, lastName: true } } },
                orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
            },
        },
    });
    if (!seccion || !seccion.academicYearId) throw createError(404, 'Sección no encontrada', 'NOT_FOUND');
    const materia = seccion.subjects[0]?.subject;
    if (!materia) throw createError(404, 'Esa materia no es de la sección', 'MATERIA_AJENA');
    const config = await getAcademicConfig(instituteId);
    const revisiones = new Map<string, any>(
        (
            await prisma.notaDeRevision.findMany({
                where: { academicYearId: seccion.academicYearId, subjectId },
                select: { studentId: true, score: true, componentes: true, fecha: true, observaciones: true },
            })
        ).map((r: any) => [r.studentId, r])
    );
    const alumnos = [];
    const lapsos = await lapsosDelAno(prisma, seccion.academicYearId);
    if (materia.evaluacion !== 'CUALITATIVA') {
        for (const sc of seccion.studentClassrooms) {
            const d = await gradesService.promedioDeLaMateria(prisma, sc.student.id, subjectId, undefined, lapsos, config.redondeoDeDefinitivas);
            if (!d.conNotas || d.promedio >= config.notaMinimaAprobatoria) continue;
            const r = revisiones.get(sc.student.id);
            alumnos.push({
                id: sc.student.id,
                nombre: `${sc.student.lastName}, ${sc.student.firstName}`,
                definitiva: d.promedio,
                revision: r
                    ? { nota: r.score, componentes: r.componentes ?? null, fecha: r.fecha.toISOString().slice(0, 10), observaciones: r.observaciones }
                    : null,
            });
        }
    }
    return {
        seccion: { id: seccion.id, nombre: seccion.name },
        materia: { id: materia.id, nombre: materia.name },
        academicYearId: seccion.academicYearId,
        cerrado: seccion.academicYear?.status === 'COMPLETED',
        minima: config.notaMinimaAprobatoria,
        componentes: config.revision.componentes,
        alumnos,
    };
}
