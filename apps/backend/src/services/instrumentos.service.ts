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
import {
    apuntarQuienPuso,
    borrarNotasDelInstrumentoViejo,
    choquesDeNotas,
    conNombres,
    cuantasNotas,
    dejarEnEspera,
    huellaDelInstrumento,
    nombreDe,
    nombreDelTipo,
    ponerNotasMirandoAntes,
    quienLaBorro,
    quienesPusieronNotas,
    type Io,
} from './cambios-sin-conexion.service';

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

/**
 * Guarda el instrumento (con `version`: si otro lo cambió entretanto, 409).
 *
 * **Cambiarlo cuando ya hay notas que no se vieron** (2026-09-30): el cambio
 * hecho sin conexión trae cuántas notas había con el anterior (`notasVistas`).
 * Si ahora hay más —el profesor calificó mientras tanto—, se pregunta a quien
 * lo cambia si aún quiere (409 `CAMBIO_MIENTRAS_TANTO`). `decision: 'cambiar'`:
 * esas notas se borran (copia en la papelera) y todas sus actividades toman el
 * nuevo; `'dejar'`: no se cambia nada. Lo decidió así Cristian.
 */
export async function guardarInstrumento(
    prisma: any,
    user: any,
    rowId: string,
    datos: { definicion: unknown; version?: number | null; notasVistas?: number | null; decision?: 'cambiar' | 'dejar' }
) {
    await laFila(prisma, user, rowId, 'planificar');
    let def: Instrumento;
    try {
        def = validarInstrumento(datos?.definicion);
    } catch (e) {
        throw mal(e);
    }
    if (datos.notasVistas != null && Number.isFinite(Number(datos.notasVistas))) {
        const actual = await prisma.instrumentoDeEvaluacion.findUnique({ where: { planRowId: rowId } });
        const suyas = await prisma.classActivity.findMany({ where: { planRowId: rowId }, select: { scores: true, notasPuestasPor: true } });
        const hay = suyas.reduce((n: number, a: any) => n + cuantasNotas(a.scores), 0);
        const mismo = actual && huellaDelInstrumento(actual.definicion) === huellaDelInstrumento(def);
        if (!mismo && hay > Number(datos.notasVistas)) {
            if (datos.decision === 'dejar') return { sinCambios: true };
            if (datos.decision !== 'cambiar') {
                const quienes = [...new Set(suyas.flatMap((a: any) => quienesPusieronNotas(a.notasPuestasPor, user.id)))] as string[];
                throw Object.assign(
                    createError(409, 'Mientras tanto se calificó con el instrumento anterior: ¿aún quieres cambiarlo? Esas notas se borrarían', 'CAMBIO_MIENTRAS_TANTO'),
                    { que: 'NOTAS_CON_EL_INSTRUMENTO', notas: hay, notasVistas: Number(datos.notasVistas), quienes: await Promise.all(quienes.map((q) => nombreDe(prisma, q))), anterior: actual?.tipo ?? null }
                );
            }
            await borrarNotasDelInstrumentoViejo(prisma, rowId, def, { usuarioId: user.id, motivo: 'Cambio de instrumento con notas puestas con el anterior' });
        }
    }
    const guardado = await prisma.$transaction(async (tx: any) => {
        const antes = await tx.instrumentoDeEvaluacion.findUnique({ where: { planRowId: rowId } });
        if (antes && datos.version != null && datos.version !== antes.version) {
            throw createError(409, 'Otro guardó este instrumento mientras lo editabas: vuelve a abrirlo', 'INSTRUMENTO_CAMBIADO');
        }
        const inst = antes
            ? await tx.instrumentoDeEvaluacion.update({ where: { planRowId: rowId }, data: { tipo: def.tipo, definicion: def, version: { increment: 1 }, cambiadoPor: user.id } })
            : await tx.instrumentoDeEvaluacion.create({ data: { planRowId: rowId, tipo: def.tipo, definicion: def, cambiadoPor: user.id } });
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
/**
 * Lo que trae lo hecho sin conexión: con qué instrumento se marcó (su
 * definición entera: si hay que volver a él, hace falta) y qué había.
 */
export interface MarcasSinConexion {
    instrumento?: unknown;
    antes?: Record<string, number | null>;
    decision?: 'la-mia';
    hechoEn?: Date | null;
    io?: Io;
}

/** Lo que devuelve calificar: hecho, o esperando la decisión de otro. */
export type Calificado =
    | { calificados: number; notas?: Record<string, number | null>; maximo?: number; aMano?: boolean }
    | { enEspera: true; esperaId: string; esperaA: string; mensaje: string };

export async function calificarConInstrumento(
    prisma: any,
    user: any,
    activityId: string,
    marcas: Record<string, Marcas | null>,
    sinConexion: MarcasSinConexion = {}
): Promise<Calificado> {
    const actividad = await prisma.classActivity.findUnique({
        where: { id: activityId },
        select: { id: true, classroomId: true, subjectId: true, instrumento: true, planRowId: true, scores: true, title: true, maxScore: true },
    });
    if (!actividad) {
        // Borrada mientras tanto: decide quien la borró (ver `saveClassActivityGrades`).
        const borrada = sinConexion.instrumento ? await quienLaBorro(prisma, 'classActivity', activityId) : null;
        if (!borrada?.contenido?.classroomId) throw createError(404, 'Actividad no encontrada', 'NOT_FOUND');
        await assertClassroomScope(prisma, user, borrada.contenido.classroomId, { subjectId: borrada.contenido.subjectId, accion: 'dar notas' });
        const usado = (() => {
            try {
                return validarInstrumento(sinConexion.instrumento);
            } catch (e) {
                throw mal(e);
            }
        })();
        const scores: Record<string, number | null> = {};
        for (const [a, m] of Object.entries(marcas)) if (m) scores[a] = notaDelInstrumento(usado, m);
        const titulo = String(borrada.contenido.title ?? 'la actividad');
        const espera = await dejarEnEspera(prisma, sinConexion.io, user.instituteId, {
            autorId: user.id,
            decideId: borrada.borradoPor,
            tipo: 'NOTAS_A_ACTIVIDAD_BORRADA',
            objetivo: activityId,
            datos: { scores, maxScore: maximoDelInstrumento(usado), titulo },
            motivo: 'La actividad se borró mientras estas notas esperaban para enviarse',
            hechoEn: sinConexion.hechoEn,
            titulo: `Notas para «${titulo}», que borraste`,
            mensaje: `${await nombreDe(prisma, user.id)} calificó «${titulo}» sin conexión y la borraste antes de que llegara. ¿La recuperas con esas notas?`,
        });
        return { enEspera: true, esperaId: espera.id, esperaA: await nombreDe(prisma, borrada.borradoPor), mensaje: `«${titulo}» se borró mientras tanto: tus notas esperan a que quien la borró decida.` };
    }
    await assertClassroomScope(prisma, user, actividad.classroomId, { subjectId: actividad.subjectId, accion: 'dar notas' });
    const def = await instrumentoDeLaActividad(prisma, actividad);

    /**
     * EL INSTRUMENTO CAMBIÓ MIENTRAS SE CALIFICABA SIN CONEXIÓN (2026-09-30)
     *
     * Las marcas se hicieron con otra hoja. Si el instrumento se QUITÓ, la
     * nota que salió de ellas entra a mano. Si se CAMBIÓ por otro, decide
     * quien lo cambió: «¿Aún quieres la escala?» (`cambios-sin-conexion.service`).
     */
    if (sinConexion.instrumento) {
        let usado: Instrumento;
        try {
            usado = validarInstrumento(sinConexion.instrumento);
        } catch (e) {
            throw mal(e);
        }
        if (!def) {
            const notas: Record<string, number | null> = {};
            for (const [a, m] of Object.entries(marcas)) notas[a] = m === null ? null : notaDelInstrumento(usado, m);
            const { choques } = await ponerNotasMirandoAntes(prisma, activityId, notas, undefined, sinConexion.decision === 'la-mia' ? undefined : sinConexion.antes, user.id);
            if (choques.length) throw choqueDeNotas(await conNombres(prisma, choques), actividad);
            return { calificados: Object.keys(notas).length, notas, aMano: true };
        }
        if (huellaDelInstrumento(usado) !== huellaDelInstrumento(def)) {
            const inst = actividad.planRowId ? await prisma.instrumentoDeEvaluacion.findUnique({ where: { planRowId: actividad.planRowId } }) : null;
            const decide = inst?.cambiadoPor ?? null;
            const titulo = String(actividad.title ?? 'la actividad');
            const espera = await dejarEnEspera(prisma, sinConexion.io, user.instituteId, {
                autorId: user.id,
                decideId: decide,
                tipo: 'MARCAS_CON_OTRO_INSTRUMENTO',
                objetivo: activityId,
                datos: { marcas, instrumento: usado, nuevo: def, titulo },
                motivo: 'El instrumento cambió mientras estas marcas esperaban para enviarse',
                hechoEn: sinConexion.hechoEn,
                titulo: `Notas con la ${nombreDelTipo(usado.tipo)} en «${titulo}»`,
                mensaje: `${await nombreDe(prisma, user.id)} calificó «${titulo}» con la ${nombreDelTipo(usado.tipo)} antes de que la cambiaras a ${nombreDelTipo(def.tipo)}. ¿Aún quieres la ${nombreDelTipo(def.tipo)}? Si sí, esas notas se borran; si no, se queda la ${nombreDelTipo(usado.tipo)} con sus notas.`,
            });
            return {
                enEspera: true,
                esperaId: espera.id,
                esperaA: await nombreDe(prisma, decide),
                mensaje: `El instrumento de «${titulo}» cambió mientras tanto: tus notas esperan a que se decida con cuál se queda.`,
            };
        }
    }
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
    const antes = sinConexion.decision === 'la-mia' ? undefined : sinConexion.antes;
    const choques = await prisma.$transaction(async (tx: any) => {
        // La misma nota tocada por dos: se compara y se escribe de una vez.
        if (antes) {
            const [fila] = await tx.$queryRaw`SELECT scores, "notasPuestasPor" FROM class_activities WHERE id = ${activityId} FOR UPDATE`;
            const hay = choquesDeNotas(fila?.scores, fila?.notasPuestasPor, { ...notas, ...Object.fromEntries(quitar.map((q) => [q, null])) }, antes);
            if (hay.length) return hay;
        }
        await tx.$executeRaw`
            UPDATE class_activities
               SET scores = ((CASE jsonb_typeof(scores) WHEN 'object' THEN scores ELSE '{}'::jsonb END) - ${quitar}::text[]) || ${JSON.stringify(notas)}::jsonb,
                   "detalleDelInstrumento" = ((CASE jsonb_typeof("detalleDelInstrumento") WHEN 'object' THEN "detalleDelInstrumento" ELSE '{}'::jsonb END) - ${quitar}::text[]) || ${JSON.stringify(detalle)}::jsonb,
                   instrumento = COALESCE(instrumento, ${JSON.stringify(def)}::jsonb),
                   "maxScore" = ${maximo}::double precision,
                   "updatedAt" = NOW()
             WHERE id = ${activityId}`;
        await apuntarQuienPuso(tx, activityId, alumnos, user.id);
        return [];
    });
    if (choques.length) throw choqueDeNotas(await conNombres(prisma, choques), actividad);
    return { calificados: alumnos.length, notas, maximo };
}

function choqueDeNotas(choques: unknown[], actividad: { id: string; title?: string | null }) {
    return Object.assign(createError(409, 'Mientras tanto otra persona cambió estas notas: elige cuál queda', 'CAMBIO_MIENTRAS_TANTO'), {
        que: 'NOTAS',
        choques,
        actividad: { id: actividad.id, title: actividad.title },
    });
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
