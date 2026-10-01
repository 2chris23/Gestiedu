import { createHash } from 'crypto';
import { createError } from '../middleware/error.middleware';
import { avisar } from './avisos.service';
import { guardarEnPapelera } from '../utils/papelera';
import { notaDelInstrumento, validarInstrumento, maximoDelInstrumento, type Instrumento, type Marcas } from '../utils/instrumentos';
import { sumarNotas, arreglarNotasGuardadasComoTexto, type Notas } from '../utils/notas-de-clase';

/**
 * LOS CHOQUES DE LO HECHO SIN CONEXIÓN (2026-09-30)
 *
 * Lo decidió Cristian, regla por regla:
 *
 *  1. **La misma nota tocada por dos**: queda la primera en llegar; al que llega
 *     segundo se le pregunta cuál queda (409 `CAMBIO_MIENTRAS_TANTO`).
 *  2. **Borrar una actividad a la que, mientras tanto, otro le puso notas**: no
 *     se borra a ciegas; se le pregunta a quien borraba si aún quiere (409).
 *  3. **Notas que llegan a una actividad que otro ya borró**: no se pierden;
 *     se le pregunta a quien la borró si la recupera con ellas (202 `EN_ESPERA`).
 *  4. **Marcas de un instrumento que otro cambió mientras tanto**: decide quien
 *     lo cambió. «¿Aún quieres la escala?» Sí → esas notas se borran; No →
 *     vuelve la lista de cotejo con las notas del profesor (202 `EN_ESPERA`).
 *
 * Nada se decide por la hora del teléfono (se cambia a mano): se compara lo
 * que la persona VIO (`antes`, `notasVistas`, la huella del instrumento) con
 * lo que hay.
 */

type Prisma = any;
export type Io = { to: (sala: string) => { emit: (evento: string, datos: unknown) => void } } | null | undefined;

// ─── 1. La misma nota tocada por dos ────────────────────────────────────────

export interface ChoqueDeNota {
    studentId: string;
    /** Lo que había cuando esta persona la cambió. */
    antes: number | null;
    /** Lo que hay ahora en el servidor. */
    ahora: number | null;
    /** Lo que esta persona quiere poner. */
    tuya: number | null;
    /** Quién puso la de ahora, si se sabe. */
    quien: string | null;
    cuando: string | null;
}

const comoNota = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * Qué alumnos chocan: los que traen `antes` y la nota de ahora ya no es esa.
 * Si el otro puso lo mismo que esta persona quiere, no hay nada que elegir.
 */
export function choquesDeNotas(
    ahora: Record<string, unknown> | null | undefined,
    puestasPor: Record<string, { usuarioId?: string; en?: string }> | null | undefined,
    nuevas: Record<string, number | null>,
    antes: Record<string, number | null> | null | undefined,
    /** Quien envía: lo que él mismo cambió mientras tanto (otra pestaña, otro teléfono) no es «de otro». */
    yo?: string | null
): ChoqueDeNota[] {
    if (!antes) return [];
    const choques: ChoqueDeNota[] = [];
    for (const [studentId, tuya] of Object.entries(nuevas)) {
        if (!(studentId in antes)) continue;
        const vio = comoNota(antes[studentId]);
        const hay = comoNota(ahora?.[studentId]);
        if (hay === vio || hay === comoNota(tuya)) continue;
        const p = puestasPor?.[studentId];
        if (yo && p?.usuarioId === yo) continue;
        choques.push({ studentId, antes: vio, ahora: hay, tuya: comoNota(tuya), quien: p?.usuarioId ?? null, cuando: p?.en ?? null });
    }
    return choques;
}

/** Apunta quién puso la nota de estos alumnos (en la misma transacción). */
export async function apuntarQuienPuso(tx: Prisma, activityId: string, alumnos: string[], usuarioId: string): Promise<void> {
    if (!alumnos.length || !usuarioId) return;
    const en = new Date().toISOString();
    const marcas = JSON.stringify(Object.fromEntries(alumnos.map((a) => [a, { usuarioId, en }])));
    await tx.$executeRaw`
        UPDATE class_activities
           SET "notasPuestasPor" = (CASE jsonb_typeof("notasPuestasPor") WHEN 'object' THEN "notasPuestasPor" ELSE '{}'::jsonb END) || ${marcas}::jsonb
         WHERE id = ${activityId}`;
}

/** «Juan Uribe», o «alguien» si ya no está. */
export async function nombreDe(prisma: Prisma, usuarioId: string | null | undefined): Promise<string> {
    if (!usuarioId) return 'alguien';
    const u = await prisma.user.findUnique({ where: { id: usuarioId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName} ${u.lastName}`.trim() : 'alguien';
}

/** Para el 409: los choques con el nombre de quien puso la otra nota. */
export async function conNombres(prisma: Prisma, choques: ChoqueDeNota[]) {
    const nombres = new Map<string, string>();
    for (const c of choques) if (c.quien && !nombres.has(c.quien)) nombres.set(c.quien, await nombreDe(prisma, c.quien));
    return choques.map((c) => ({ ...c, quienNombre: c.quien ? nombres.get(c.quien) : null }));
}

/**
 * Pone las notas a mano mirando que nadie las haya cambiado entre tanto.
 * La fila se bloquea (`FOR UPDATE`) para que la comparación y la escritura
 * sean una sola cosa: dos que llegan a la vez no se cuelan por medio.
 */
export async function ponerNotasMirandoAntes(
    prisma: Prisma,
    activityId: string,
    notas: Notas,
    maxScore: number | undefined,
    antes: Record<string, number | null> | undefined,
    usuarioId: string
): Promise<{ choques: ChoqueDeNota[] }> {
    return prisma.$transaction(async (tx: Prisma) => {
        const [fila] = await tx.$queryRaw`SELECT scores, "notasPuestasPor" FROM class_activities WHERE id = ${activityId} FOR UPDATE`;
        await arreglarNotasGuardadasComoTexto(tx, activityId, fila?.scores);
        const ahora = typeof fila?.scores === 'string' ? JSON.parse(fila.scores) : fila?.scores;
        const choques = choquesDeNotas(ahora, fila?.notasPuestasPor, notas, antes, usuarioId);
        if (choques.length) return { choques };
        await sumarNotas(tx, activityId, notas, maxScore);
        await apuntarQuienPuso(tx, activityId, Object.keys(notas), usuarioId);
        return { choques: [] };
    });
}

// ─── 2. Borrar con notas nuevas ─────────────────────────────────────────────

export function cuantasNotas(scores: unknown): number {
    const mapa = typeof scores === 'string' ? (() => { try { return JSON.parse(scores); } catch { return {}; } })() : scores;
    if (!mapa || typeof mapa !== 'object') return 0;
    return Object.values(mapa as Record<string, unknown>).filter((v) => v !== null && v !== undefined && v !== '').length;
}

/** Quiénes, además de `yo`, pusieron notas en esta actividad. */
export function quienesPusieronNotas(puestasPor: unknown, yo: string): string[] {
    if (!puestasPor || typeof puestasPor !== 'object') return [];
    return [...new Set(Object.values(puestasPor as Record<string, { usuarioId?: string }>).map((p) => p?.usuarioId).filter((u): u is string => Boolean(u) && u !== yo))];
}

// ─── 3 y 4. Lo que espera la decisión de otro ───────────────────────────────

export type TipoDeEspera = 'NOTAS_A_ACTIVIDAD_BORRADA' | 'MARCAS_CON_OTRO_INSTRUMENTO';

export async function dejarEnEspera(
    prisma: Prisma,
    io: Io,
    instituteId: string | null,
    d: { autorId: string; decideId: string | null; tipo: TipoDeEspera; objetivo: string; datos: unknown; motivo: string; hechoEn?: Date | null; titulo: string; mensaje: string }
) {
    const espera = await prisma.cambioEnEspera.create({
        data: { autorId: d.autorId, decideId: d.decideId, tipo: d.tipo, objetivo: d.objetivo, datos: d.datos as any, motivo: d.motivo, hechoEn: d.hechoEn ?? null },
    });
    if (d.decideId && instituteId) {
        await avisar(prisma, instituteId, io, {
            a: [d.decideId],
            titulo: d.titulo,
            mensaje: d.mensaje,
            enlace: `/dashboard/por-decidir?cambio=${espera.id}`,
            tipo: 'POR_DECIDIR',
            alTelefono: { titulo: 'Hay algo por decidir', cuerpo: 'Un cambio hecho sin conexión necesita tu respuesta.' },
        });
    }
    return espera;
}

/** La huella de un instrumento: para saber si las marcas se hicieron con ESTE. */
export function huellaDelInstrumento(def: unknown): string | null {
    if (!def || typeof def !== 'object') return null;
    const ordenar = (v: any): any =>
        Array.isArray(v) ? v.map(ordenar) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v;
    return createHash('sha1').update(JSON.stringify(ordenar(def))).digest('hex');
}

/** Quién borró esta fila (la papelera lo apunta), o null si no está en la papelera. */
export async function quienLaBorro(prisma: Prisma, tabla: string, id: string): Promise<{ borradoPor: string | null; contenido: any; registro: string } | null> {
    const r = await prisma.registroBorrado.findFirst({ where: { tabla, registroId: id }, orderBy: { createdAt: 'desc' } });
    return r ? { borradoPor: r.borradoPor ?? null, contenido: r.contenido, registro: r.id } : null;
}

/**
 * Vuelve a poner una actividad que está en la papelera, tal cual estaba (sus
 * notas van dentro de la fila). Si ya volvió, no hace nada.
 */
export async function recuperarActividad(prisma: Prisma, activityId: string): Promise<boolean> {
    if (await prisma.classActivity.findUnique({ where: { id: activityId }, select: { id: true } })) return true;
    const borrada = await quienLaBorro(prisma, 'classActivity', activityId);
    if (!borrada?.contenido) return false;
    const c = borrada.contenido;
    const fechas = ['dueDate', 'createdAt', 'updatedAt'];
    const data: any = {};
    for (const [k, v] of Object.entries(c)) data[k] = fechas.includes(k) && v ? new Date(v as string) : v;
    // Lo que ya no existe no se engancha: la evaluación o la sesión pudieron irse.
    if (data.planRowId && !(await prisma.evaluationPlanRow.findUnique({ where: { id: data.planRowId }, select: { id: true } }))) data.planRowId = null;
    if (data.classSessionId && !(await prisma.classSession.findUnique({ where: { id: data.classSessionId }, select: { id: true } }))) data.classSessionId = null;
    await prisma.classActivity.create({ data });
    return true;
}

export async function loQueEspera(prisma: Prisma, usuarioId: string) {
    const [porDecidir, esperando] = await Promise.all([
        prisma.cambioEnEspera.findMany({ where: { decideId: usuarioId, resuelto: false }, orderBy: { creadoEn: 'asc' } }),
        prisma.cambioEnEspera.findMany({ where: { autorId: usuarioId, resuelto: false }, orderBy: { creadoEn: 'asc' } }),
    ]);
    const conNombre = async (e: any) => ({ ...e, autorNombre: await nombreDe(prisma, e.autorId), decideNombre: await nombreDe(prisma, e.decideId) });
    return { porDecidir: await Promise.all(porDecidir.map(conNombre)), esperando: await Promise.all(esperando.map(conNombre)) };
}

/**
 * Decide lo que espera. Solo quien tiene que decidirlo, o un admin.
 *
 *  - NOTAS_A_ACTIVIDAD_BORRADA: `recuperar` (vuelve de la papelera con sus
 *    notas, y se le ponen las del profesor) o `dejar` (sigue borrada).
 *  - MARCAS_CON_OTRO_INSTRUMENTO: `nuevo` (se queda el instrumento nuevo; las
 *    marcas del profesor no se ponen) o `anterior` (vuelve el que usó el
 *    profesor, y se ponen sus marcas).
 */
export async function decidir(prisma: Prisma, io: Io, quien: { id: string; role: string; instituteId: string | null }, id: string, decision: string) {
    const e = await prisma.cambioEnEspera.findUnique({ where: { id } });
    if (!e || e.resuelto) throw createError(404, 'Eso ya se decidió o no existe', 'NOT_FOUND');
    if (e.decideId !== quien.id && quien.role !== 'ADMIN') throw createError(403, 'Esto lo decide otra persona', 'FORBIDDEN');
    const datos = e.datos as any;
    let mensajeAlAutor = '';

    if (e.tipo === 'NOTAS_A_ACTIVIDAD_BORRADA') {
        if (decision === 'recuperar') {
            if (!(await recuperarActividad(prisma, e.objetivo))) throw createError(409, 'La actividad ya no está en la papelera', 'SIN_COPIA');
            await ponerNotasMirandoAntes(prisma, e.objetivo, datos.scores ?? {}, datos.maxScore, undefined, e.autorId);
            mensajeAlAutor = `Se recuperó «${datos.titulo ?? 'la actividad'}» con tus notas.`;
        } else if (decision === 'dejar') {
            mensajeAlAutor = `«${datos.titulo ?? 'La actividad'}» sigue borrada: tus notas no se pusieron.`;
        } else throw createError(400, 'La decisión es «recuperar» o «dejar»', 'DECISION_INVALIDA');
    } else if (e.tipo === 'MARCAS_CON_OTRO_INSTRUMENTO') {
        if (decision === 'anterior') {
            const usado: Instrumento = validarInstrumento(datos.instrumento);
            const act = await prisma.classActivity.findUnique({ where: { id: e.objetivo }, select: { planRowId: true } });
            if (!act) throw createError(409, 'La actividad ya no existe', 'NOT_FOUND');
            if (act.planRowId) {
                await prisma.instrumentoDeEvaluacion.upsert({
                    where: { planRowId: act.planRowId },
                    update: { tipo: usado.tipo, definicion: usado as any, version: { increment: 1 }, cambiadoPor: quien.id },
                    create: { planRowId: act.planRowId, tipo: usado.tipo, definicion: usado as any, cambiadoPor: quien.id },
                });
            }
            await ponerMarcas(prisma, e.objetivo, usado, datos.marcas ?? {}, e.autorId);
            mensajeAlAutor = `Se mantuvo la ${nombreDelTipo(usado.tipo)} en «${datos.titulo ?? 'la actividad'}», con tus notas.`;
        } else if (decision === 'nuevo') {
            mensajeAlAutor = `«${datos.titulo ?? 'La actividad'}» se califica ahora con otro instrumento: tus notas con la ${nombreDelTipo(datos.instrumento?.tipo)} no se pusieron. Vuelve a calificarla.`;
        } else throw createError(400, 'La decisión es «nuevo» o «anterior»', 'DECISION_INVALIDA');
    } else throw createError(400, 'No se sabe decidir esto', 'DECISION_INVALIDA');

    await prisma.cambioEnEspera.update({ where: { id }, data: { resuelto: true, resolucion: decision, resueltoPor: quien.id, resueltoEn: new Date() } });
    if (quien.instituteId) {
        await avisar(prisma, quien.instituteId, io, { a: [e.autorId], titulo: 'Se decidió un cambio tuyo', mensaje: mensajeAlAutor, tipo: 'POR_DECIDIR', enlace: '/dashboard' });
    }
    return { resuelto: true, decision };
}

export function nombreDelTipo(tipo: unknown): string {
    return tipo === 'COTEJO' ? 'lista de cotejo' : tipo === 'ESCALA' ? 'escala de estimación' : tipo === 'RUBRICA' ? 'rúbrica' : tipo === 'PUNTOS' ? 'evaluación por puntos' : 'instrumento';
}

/**
 * Pone unas marcas con un instrumento dado: su copia pasa a ser ESE (con el
 * que se calificó), y las notas salen de él. El desglose de los alumnos que no
 * vienen se quita (era de otro instrumento); su nota se queda.
 */
export async function ponerMarcas(prisma: Prisma, activityId: string, def: Instrumento, marcas: Record<string, Marcas>, usuarioId: string) {
    const notas: Record<string, number | null> = {};
    const detalle: Record<string, { marcas: Marcas; total: number | null }> = {};
    for (const [a, m] of Object.entries(marcas)) {
        const total = notaDelInstrumento(def, m);
        notas[a] = total;
        detalle[a] = { marcas: m, total };
    }
    await prisma.$transaction(async (tx: Prisma) => {
        await tx.$executeRaw`
            UPDATE class_activities
               SET scores = (CASE jsonb_typeof(scores) WHEN 'object' THEN scores ELSE '{}'::jsonb END) || ${JSON.stringify(notas)}::jsonb,
                   "detalleDelInstrumento" = ${JSON.stringify(detalle)}::jsonb,
                   instrumento = ${JSON.stringify(def)}::jsonb,
                   "maxScore" = ${maximoDelInstrumento(def)}::double precision,
                   "updatedAt" = NOW()
             WHERE id = ${activityId}`;
        await apuntarQuienPuso(tx, activityId, Object.keys(notas), usuarioId);
    });
}

/**
 * «Sí, cambiarlo igual» con notas puestas con el anterior: esas notas se
 * borran (antes, copia en la papelera de cada actividad) y las actividades
 * toman el instrumento nuevo. Lo pidió así Cristian.
 */
export async function borrarNotasDelInstrumentoViejo(prisma: Prisma, rowId: string, def: Instrumento, quien: { usuarioId?: string; motivo?: string }) {
    const suyas = await prisma.classActivity.findMany({ where: { planRowId: rowId } });
    const conNotas = suyas.filter((a: any) => cuantasNotas(a.scores) > 0);
    for (const a of conNotas) {
        await prisma.$transaction(async (tx: Prisma) => {
            await guardarEnPapelera(tx, 'classActivity', [a], quien);
            await tx.classActivity.update({
                where: { id: a.id },
                data: { scores: {}, detalleDelInstrumento: {}, notasPuestasPor: {}, instrumento: def as any, maxScore: maximoDelInstrumento(def) },
            });
        });
    }
    return conNotas;
}
