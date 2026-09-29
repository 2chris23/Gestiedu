import { createError } from '../middleware/error.middleware';
import { assertClassroomScope } from './authorization.service';
import { borrarGuardandoCopia, type QuienBorra } from '../utils/papelera';
import { arreglarNotasGuardadasComoTexto } from '../utils/notas-de-clase';
import {
    InstrumentoInvalido,
    maximoDelInstrumento,
    notaDelInstrumento,
    validarInstrumento,
    type Instrumento,
    type Marcas,
} from '../utils/instrumentos';

/**
 * EL INSTRUMENTO DE CADA EVALUACIÓN DEL PLAN, Y CALIFICAR CON ÉL
 *
 * Decidido con Cristian (2026-09-27): el instrumento se arma EN EL PLAN, en
 * cada evaluación (como en el plan en papel: «Infografía → Escala de
 * estimación»). Las actividades de esa semana se califican marcando casillas y
 * la nota sale sola; el alumno y su representante ven su desglose.
 *
 *  - La actividad guarda su COPIA del instrumento al calificarse la primera
 *    vez: cambiar el plan después no cambia lo que ya significan las marcas.
 *    Mientras no tenga notas, la copia sigue al plan.
 *  - Las notas siguen en `scores`: toda cuenta de promedios sigue igual.
 *  - Con instrumento no se pone nota a mano (409 `NOTA_POR_INSTRUMENTO`),
 *    salvo al alumno «evaluado de otra forma».
 *
 * Pruebas: `tests/integration/instrumentos.test.ts` (INSTR-*).
 */

const mal = (e: unknown) =>
    e instanceof InstrumentoInvalido ? createError(400, e.message, 'INSTRUMENTO_INVALIDO') : e;

async function laFila(prisma: any, user: any, rowId: string, accion: string) {
    const fila = await prisma.evaluationPlanRow.findUnique({
        where: { id: rowId },
        select: { id: true, classroomId: true, subjectId: true, lapso: true, rowType: true, weekNumber: true, actividadEval: true, tecnicas: true, instrumentos: true, puntos: true, indicadores: true },
    });
    if (!fila || fila.rowType !== 'EVALUATION') throw createError(404, 'Esa evaluación del plan no existe', 'NOT_FOUND');
    await assertClassroomScope(prisma, user, fila.classroomId, { subjectId: fila.subjectId, accion });
    return fila;
}

const tieneNotas = (scores: unknown) =>
    Boolean(scores && typeof scores === 'object' && Object.values(scores as object).some((v) => v !== null && v !== undefined));

export async function instrumentoDeLaFila(prisma: any, user: any, rowId: string) {
    const fila = await laFila(prisma, user, rowId, 'ver el plan');
    const inst = await prisma.instrumentoDeEvaluacion.findUnique({ where: { planRowId: rowId } });
    return {
        fila,
        instrumento: inst ? { tipo: inst.tipo, definicion: inst.definicion as Instrumento, version: inst.version, maximo: maximoDelInstrumento(inst.definicion) } : null,
    };
}

/** Guarda el instrumento (con `version`: si otro lo cambió entretanto, 409). */
export async function guardarInstrumento(prisma: any, user: any, rowId: string, datos: { definicion: unknown; version?: number | null }) {
    await laFila(prisma, user, rowId, 'planificar');
    let def: Instrumento;
    try {
        def = validarInstrumento(datos?.definicion);
    } catch (e) {
        throw mal(e);
    }
    const guardado = await prisma.$transaction(async (tx: any) => {
        const antes = await tx.instrumentoDeEvaluacion.findUnique({ where: { planRowId: rowId } });
        if (antes && datos.version != null && datos.version !== antes.version) {
            throw createError(409, 'Otro guardó este instrumento mientras lo editabas: vuelve a abrirlo', 'INSTRUMENTO_CAMBIADO');
        }
        const inst = antes
            ? await tx.instrumentoDeEvaluacion.update({ where: { planRowId: rowId }, data: { tipo: def.tipo, definicion: def, version: { increment: 1 } } })
            : await tx.instrumentoDeEvaluacion.create({ data: { planRowId: rowId, tipo: def.tipo, definicion: def } });
        // Las actividades de esa evaluación que aún no tienen notas siguen al plan.
        const suyas = await tx.classActivity.findMany({ where: { planRowId: rowId }, select: { id: true, scores: true } });
        const sinNotas = suyas.filter((a: any) => !tieneNotas(a.scores)).map((a: any) => a.id);
        if (sinNotas.length) {
            await tx.classActivity.updateMany({
                where: { id: { in: sinNotas } },
                data: { instrumento: def, maxScore: maximoDelInstrumento(def), detalleDelInstrumento: {} },
            });
        }
        return inst;
    });
    return { tipo: guardado.tipo, definicion: guardado.definicion, version: guardado.version, maximo: maximoDelInstrumento(def) };
}

export async function borrarInstrumento(prisma: any, user: any, rowId: string, quien: QuienBorra) {
    await laFila(prisma, user, rowId, 'planificar');
    const n = await borrarGuardandoCopia(prisma, 'instrumentoDeEvaluacion', { planRowId: rowId }, quien);
    if (!n) throw createError(404, 'Esa evaluación no tiene instrumento', 'NOT_FOUND');
    /**
     * QUITAR EL INSTRUMENTO ES QUITARLO DE SUS ACTIVIDADES
     *
     * Antes las que ya tenían notas se quedaban su copia, y el profesor que lo
     * había quitado seguía calificando con él al pulsar «Dar nota». Ahora todas
     * vuelven a calificarse a mano; la nota puesta se queda (sobre su máximo) y
     * se puede cambiar. El desglose por criterio sí se va: ya no hay criterios.
     */
    const suyas = await prisma.classActivity.findMany({ where: { planRowId: rowId }, select: { id: true, scores: true } });
    const sinNotas = suyas.filter((a: any) => !tieneNotas(a.scores)).map((a: any) => a.id);
    const conNotas = suyas.filter((a: any) => tieneNotas(a.scores)).map((a: any) => a.id);
    if (sinNotas.length) {
        await prisma.classActivity.updateMany({ where: { id: { in: sinNotas } }, data: { instrumento: null, detalleDelInstrumento: null, maxScore: 20 } });
    }
    if (conNotas.length) {
        await prisma.classActivity.updateMany({ where: { id: { in: conNotas } }, data: { instrumento: null, detalleDelInstrumento: null } });
    }
    return { borrado: true };
}

/**
 * El instrumento con que se califica una actividad: su copia, o el de su
 * evaluación del plan (que pasa a ser su copia).
 */
export async function instrumentoDeLaActividad(prisma: any, actividad: { id: string; instrumento: any; planRowId: string | null }) {
    if (actividad.instrumento) return actividad.instrumento as Instrumento;
    if (!actividad.planRowId) return null;
    const inst = await prisma.instrumentoDeEvaluacion.findUnique({ where: { planRowId: actividad.planRowId } });
    return inst ? (inst.definicion as Instrumento) : null;
}

/**
 * Califica con el instrumento: `marcas` es alumno → sus marcas (o `null` para
 * quitarle la nota). Cada tanda se AÑADE a lo guardado en una sola escritura
 * (`||` de PostgreSQL), como las notas a mano: dos profesores (o el teléfono y
 * el portátil) no se pisan.
 */
export async function calificarConInstrumento(prisma: any, user: any, activityId: string, marcas: Record<string, Marcas | null>) {
    const actividad = await prisma.classActivity.findUnique({
        where: { id: activityId },
        select: { id: true, classroomId: true, subjectId: true, instrumento: true, planRowId: true, scores: true },
    });
    if (!actividad) throw createError(404, 'Actividad no encontrada', 'NOT_FOUND');
    await assertClassroomScope(prisma, user, actividad.classroomId, { subjectId: actividad.subjectId, accion: 'dar notas' });
    const def = await instrumentoDeLaActividad(prisma, actividad);
    if (!def) throw createError(400, 'Esta actividad no tiene instrumento: su evaluación del plan no lo tiene', 'SIN_INSTRUMENTO');
    if (!marcas || typeof marcas !== 'object' || Array.isArray(marcas)) throw createError(400, 'Las marcas van como alumno → marcas', 'INSTRUMENTO_INVALIDO');
    const alumnos = Object.keys(marcas);
    if (alumnos.length === 0) return { calificados: 0 };
    if (alumnos.length > 200) throw createError(400, 'Demasiados alumnos en una tanda', 'INSTRUMENTO_INVALIDO');

    const deLaSeccion = await prisma.studentClassroom.findMany({
        where: { classroomId: actividad.classroomId, isActive: true, studentId: { in: alumnos } },
        select: { studentId: true },
    });
    const suyos = new Set(deLaSeccion.map((s: any) => s.studentId));
    const ajeno = alumnos.find((a) => !suyos.has(a));
    if (ajeno) throw createError(400, 'Hay un alumno que no es de esta sección', 'ALUMNO_AJENO');

    const notas: Record<string, number | null> = {};
    const detalle: Record<string, { marcas: Marcas; total: number | null }> = {};
    const quitar: string[] = [];
    try {
        for (const a of alumnos) {
            const m = marcas[a];
            if (m === null) {
                quitar.push(a);
                continue;
            }
            const total = notaDelInstrumento(def, m);
            notas[a] = total;
            detalle[a] = { marcas: m, total };
        }
    } catch (e) {
        throw mal(e);
    }

    await arreglarNotasGuardadasComoTexto(prisma, activityId, actividad.scores);
    const maximo = maximoDelInstrumento(def);
    await prisma.$executeRaw`
        UPDATE class_activities
           SET scores = ((CASE jsonb_typeof(scores) WHEN 'object' THEN scores ELSE '{}'::jsonb END) - ${quitar}::text[]) || ${JSON.stringify(notas)}::jsonb,
               "detalleDelInstrumento" = ((CASE jsonb_typeof("detalleDelInstrumento") WHEN 'object' THEN "detalleDelInstrumento" ELSE '{}'::jsonb END) - ${quitar}::text[]) || ${JSON.stringify(detalle)}::jsonb,
               instrumento = COALESCE(instrumento, ${JSON.stringify(def)}::jsonb),
               "maxScore" = ${maximo}::double precision,
               "updatedAt" = NOW()
         WHERE id = ${activityId}`;
    return { calificados: alumnos.length, notas, maximo };
}

/**
 * ¿Se puede poner nota a mano en esta actividad? Con instrumento, no (salvo al
 * alumno evaluado de otra forma). Devuelve el alumno que no se puede, o null.
 */
export async function notaAManoProhibida(prisma: any, activityId: string, alumnos: string[]): Promise<string | null> {
    const a = await prisma.classActivity.findUnique({ where: { id: activityId }, select: { instrumento: true, planRowId: true, evaluadoDeOtraForma: true } });
    if (!a) return null;
    const def = await instrumentoDeLaActividad(prisma, { id: activityId, ...a });
    if (!def) return null;
    const otraForma = (a.evaluadoDeOtraForma ?? {}) as Record<string, unknown>;
    return alumnos.find((s) => !otraForma[s]) ?? null;
}
