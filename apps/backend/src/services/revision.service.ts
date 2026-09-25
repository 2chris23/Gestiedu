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
 *   - La registra el admin (control de estudios).
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
        score: number;
        fecha: string;
        observaciones?: string | null;
        registradaPor: string;
    }
) {
    if (typeof datos.score !== 'number' || !Number.isFinite(datos.score) || datos.score < 0 || datos.score > NOTA_MAXIMA) {
        throw createError(400, `La nota de revisión va de 0 a ${NOTA_MAXIMA}`, 'NOTA_INVALIDA');
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

    const config = await getAcademicConfig(instituteId);
    const def = await gradesService.promedioDeLaMateria(
        prisma, datos.studentId, datos.subjectId, undefined, undefined, config.redondeoDeDefinitivas
    );
    if (!def.conNotas) {
        throw createError(409, 'La materia no tiene notas: no hay nada que revisar', 'SIN_NOTAS');
    }
    if (def.promedio >= config.notaMinimaAprobatoria) {
        throw createError(409, 'La materia está aprobada: solo se revisa una materia reprobada', 'NO_REPROBADA');
    }

    const score = redondear(datos.score, config.redondeoDeDefinitivas);
    const fecha = new Date(`${datos.fecha}T00:00:00.000Z`);
    return (prisma as any).notaDeRevision.upsert({
        where: {
            studentId_subjectId_academicYearId: {
                studentId: datos.studentId,
                subjectId: datos.subjectId,
                academicYearId: datos.academicYearId,
            },
        },
        update: { score, fecha, observaciones: datos.observaciones ?? null, registradaPor: datos.registradaPor },
        create: {
            studentId: datos.studentId,
            subjectId: datos.subjectId,
            academicYearId: datos.academicYearId,
            score,
            fecha,
            observaciones: datos.observaciones ?? null,
            registradaPor: datos.registradaPor,
        },
    });
}
