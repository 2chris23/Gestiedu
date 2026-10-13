import { PrismaClient } from '@prisma/client';
import { createError } from '../middleware/error.middleware';
import { borrarGuardandoCopia } from '../utils/papelera';
import { getAcademicConfig, type AcademicConfig } from './promotion/close-cycle.service';
import { redondearComoElMPPE } from './grades.service';
import type { ReglasDePendientes } from './promotion/reglas-del-fin-de-ano';
import { asignarLasClases } from './promotion/clase-de-la-pendiente';

export { asignarLasClases };

/**
 * LA MATERIA PENDIENTE, DE VERDAD
 *
 * La que el alumno reprobó y arrastra al año siguiente (la crea el cierre del
 * año, `close-cycle.service`). Antes era un texto en el expediente: no se
 * podía evaluar, no salía en la boleta y el cierre siguiente la ignoraba.
 *
 * COMO UNA CLASE (octubre 2026, lo pidió Cristian tras ver cómo se trabaja en
 * los liceos; circulares 0007, 006696 y 000004 del MPPE):
 *
 *   - Se trabaja en una CLASE: la materia de una sección del grado donde se
 *     reprobó, en el año en que se cursa (`claseId`). La evalúa el profesor de
 *     esa clase; el admin la pasa a otra clase de la misma materia y grado.
 *     Sin clase todavía (el año siguiente no estaba armado al cerrar), se le
 *     busca sola: la del profesor que la tenía o la de la misma letra que su
 *     sección del año en que la reprobó (`asignarLasClases`).
 *   - En varios momentos (`academicConfig.pendientes.momentos`, 4 por
 *     defecto), cada uno con 1ª y 2ª opción (el «112» de los liceos, una
 *     semana después; `OpcionDePendiente`). Quien reprueba la 1ª tiene la 2ª;
 *     el liceo puede abrirla solo si el 30 % o más del grupo reprobó (el
 *     artículo 112 al pie de la letra) o no darla. Faltar sin justificar
 *     cuenta como presentada sin nota («IN»); justificada, no cuenta.
 *   - La nota del momento (`EvaluacionDePendiente`) sale de sus opciones
 *     cuando queda decidido: la mejor. A mano (la forma de antes), se pone
 *     directa con `evaluarMomento`.
 *   - Cómo se aprueba lo dice el liceo:
 *       · MOMENTO_APROBADO (por defecto): aprobada en cuanto un momento llega
 *         a la nota mínima; esa es su nota final. Sin aprobar ninguno de todos
 *         los momentos: NO_APROBADA, con la mejor.
 *       · PROMEDIO: con todos los momentos puestos, la media decide.
 *       · PONDERADO: con todos, cada momento con su peso.
 *   - La ven el alumno y su representante (la boleta), el admin, el profesor
 *     que la evalúa y el guía de la sección del alumno.
 *   - El cierre del año siguiente la cuenta: sin aprobar, según
 *     `pendienteNoAprobada` (no se promueve, o sigue pendiente).
 *
 * Pruebas: `materias-pendientes.test.ts` (PEND-01…08) y
 * `pendientes-con-opciones.test.ts` (PEND-09…16). Cuenta: MAPA §1d.
 */

const NOTA_MAXIMA = 20;

export interface QuienPide {
    id: string;
    role: string;
}

const incluir = {
    student: { select: { id: true, firstName: true, lastName: true } },
    subject: { select: { id: true, name: true } },
    profesor: { select: { id: true, firstName: true, lastName: true } },
    clase: {
        select: {
            id: true,
            teacherId: true,
            teacher: { select: { id: true, firstName: true, lastName: true } },
            classroom: { select: { name: true, grade: true, section: true } },
        },
    },
    cicloDeOrigen: { select: { id: true, name: true } },
    ciclo: { select: { id: true, name: true, status: true } },
    evaluaciones: { orderBy: { momento: 'asc' as const } },
    opciones: { orderBy: [{ momento: 'asc' as const }, { opcion: 'asc' as const }] },
};

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Quién la evalúa: el puesto a mano (la forma de antes) o el profesor de su clase. */
function elEvaluador(p: any): { id: string; firstName: string; lastName: string } | null {
    return p.profesor ?? p.clase?.teacher ?? null;
}

function comoFila(p: any, seccionActual: string | null = null) {
    const evaluador = elEvaluador(p);
    return {
        id: p.id,
        alumno: { id: p.student.id, nombre: `${p.student.lastName}, ${p.student.firstName}` },
        materia: { id: p.subject.id, nombre: p.subject.name },
        gradoDeOrigen: p.gradoDeOrigen,
        cicloDeOrigen: p.cicloDeOrigen?.name ?? null,
        notaDeOrigen: p.notaDeOrigen,
        ciclo: { id: p.ciclo.id, nombre: p.ciclo.name, cerrado: p.ciclo.status === 'COMPLETED' },
        clase: p.clase ? { id: p.clase.id, seccion: p.clase.classroom?.name ?? '' } : null,
        seccionActual,
        profesor: evaluador ? { id: evaluador.id, nombre: `${evaluador.firstName} ${evaluador.lastName}` } : null,
        estado: p.estado as 'PENDIENTE' | 'APROBADA' | 'NO_APROBADA',
        notaFinal: p.notaFinal,
        momentos: p.evaluaciones.map((e: any) => ({
            momento: e.momento,
            nota: e.nota,
            fecha: ymd(e.fecha),
            observaciones: e.observaciones,
        })),
        opciones: (p.opciones ?? []).map((o: any) => ({
            momento: o.momento,
            opcion: o.opcion,
            nota: o.nota,
            asistio: o.asistio,
            justificada: o.justificada,
            fecha: ymd(o.fecha),
            observaciones: o.observaciones,
        })),
    };
}

/** El año escolar en curso (el activo o, si no hay, el más reciente sin cerrar). */
async function cicloEnCurso(prisma: any): Promise<string | null> {
    const activo =
        (await prisma.academicYear.findFirst({ where: { status: 'ACTIVE' }, orderBy: { startDate: 'desc' }, select: { id: true } })) ??
        (await prisma.academicYear.findFirst({ where: { status: { not: 'COMPLETED' } }, orderBy: { startDate: 'asc' }, select: { id: true } }));
    return activo?.id ?? null;
}

/** La sección de este año de cada alumno (el nombre), en bloque. */
async function seccionesActuales(prisma: any, filas: Array<{ studentId: string; cicloId: string }>): Promise<Map<string, string>> {
    if (filas.length === 0) return new Map();
    const inscripciones = await prisma.studentClassroom.findMany({
        where: {
            studentId: { in: [...new Set(filas.map((f) => f.studentId))] },
            academicYearId: { in: [...new Set(filas.map((f) => f.cicloId))] },
        },
        select: { studentId: true, academicYearId: true, isActive: true, classroom: { select: { name: true } } },
    });
    const m = new Map<string, string>();
    for (const i of inscripciones) {
        const clave = `${i.studentId}|${i.academicYearId}`;
        if (!m.has(clave) || i.isActive) m.set(clave, i.classroom.name);
    }
    return m;
}

async function comoFilas(prisma: any, filas: any[]) {
    const secciones = await seccionesActuales(prisma, filas);
    return filas.map((p) => comoFila(p, secciones.get(`${p.studentId}|${p.cicloId}`) ?? null));
}

/** Las que evalúa un profesor: las puestas a mano a él y, sin profesor a mano, las de sus clases. */
const lasQueEvalua = (profesorId: string) => ({ OR: [{ profesorId }, { profesorId: null, clase: { teacherId: profesorId } }] });

/**
 * La lista: el admin ve todas las del año; el profesor, las que evalúa él.
 */
export async function listarPendientes(prisma: any, instituteId: string, quien: QuienPide, opciones: { cicloId?: string } = {}) {
    const cicloId = opciones.cicloId ?? (await cicloEnCurso(prisma));
    const config = await getAcademicConfig(instituteId);
    if (!cicloId) return { cicloId: null, momentos: config.pendientes.momentos, forma: config.pendientes.formaDeCalificar, minima: config.notaMinimaAprobatoria, pendientes: [] };
    await asignarLasClases(prisma, cicloId);
    const where: any = { cicloId, ...(quien.role !== 'ADMIN' ? lasQueEvalua(quien.id) : {}) };
    const filas = await prisma.materiaPendiente.findMany({
        where,
        include: incluir,
        orderBy: [{ gradoDeOrigen: 'asc' }, { subject: { name: 'asc' } }, { student: { lastName: 'asc' } }],
    });
    return {
        cicloId,
        momentos: config.pendientes.momentos,
        forma: config.pendientes.formaDeCalificar,
        minima: config.notaMinimaAprobatoria,
        pendientes: await comoFilas(prisma, filas),
    };
}

/** Las de un alumno (todas: las que cursa y las de años anteriores). */
export async function pendientesDelAlumno(prisma: any, studentId: string) {
    const filas = await prisma.materiaPendiente.findMany({
        where: { studentId },
        include: incluir,
        orderBy: [{ ciclo: { startDate: 'desc' } }, { gradoDeOrigen: 'asc' }],
    });
    return comoFilas(prisma, filas);
}

export async function laPendiente(prisma: any, id: string) {
    let p = await prisma.materiaPendiente.findUnique({ where: { id }, include: incluir });
    if (!p) throw createError(404, 'Materia pendiente no encontrada', 'NOT_FOUND');
    if (!p.claseId && (await asignarLasClases(prisma, p.cicloId)) > 0) {
        p = await prisma.materiaPendiente.findUnique({ where: { id }, include: incluir });
    }
    return p;
}

export function puedeEvaluar(p: any, quien: QuienPide) {
    if (quien.role === 'ADMIN') return;
    if (quien.role === 'TEACHER' && elEvaluador(p)?.id === quien.id) return;
    throw createError(403, 'La evalúa el profesor de su clase', 'FORBIDDEN');
}

// ── LA CUENTA ──────────────────────────────────────────────────────────────

export interface OpcionParaLaCuenta {
    momento: number;
    opcion: number;
    nota: number | null;
    asistio: boolean;
    justificada: boolean;
    fecha: Date;
    registradaPorId?: string | null;
}

/** Cuenta una opción: se presentó, o faltó sin justificar y el liceo dice que eso cuenta. */
export const laOpcionCuenta = (o: OpcionParaLaCuenta | undefined, reglas: Pick<ReglasDePendientes, 'faltarPierdeElMomento'>) =>
    !!o && (o.asistio || (!o.justificada && reglas.faltarPierdeElMomento));

const reprueba = (o: OpcionParaLaCuenta, minima: number) => o.nota == null || o.nota < minima;

/**
 * Un momento con sus opciones: ¿quedó decidido? y con qué nota (la mejor; sin
 * nota si no se presentó a ninguna). `segundaAbierta` dice si este momento
 * tiene 2ª opción (SIEMPRE, o el 30 % del grupo reprobó la 1ª).
 */
export function elMomento(
    o1: OpcionParaLaCuenta | undefined,
    o2: OpcionParaLaCuenta | undefined,
    reglas: Pick<ReglasDePendientes, 'faltarPierdeElMomento'>,
    minima: number,
    segundaAbierta: boolean
): { decidido: boolean; nota: number | null; fecha: Date | null; registradaPorId: string | null } {
    const abierto = { decidido: false, nota: null, fecha: null, registradaPorId: null };
    if (!o1 || !laOpcionCuenta(o1, reglas)) return abierto;
    if (!reprueba(o1, minima)) return { decidido: true, nota: o1.nota, fecha: o1.fecha, registradaPorId: o1.registradaPorId ?? null };
    if (o2 && laOpcionCuenta(o2, reglas)) {
        const notas = [o1.nota, o2.nota].filter((n): n is number => n != null);
        return { decidido: true, nota: notas.length ? Math.max(...notas) : null, fecha: o2.fecha, registradaPorId: o2.registradaPorId ?? null };
    }
    if (!segundaAbierta) return { decidido: true, nota: o1.nota, fecha: o1.fecha, registradaPorId: o1.registradaPorId ?? null };
    return abierto;
}

/** ¿El 30 % o más de los que presentaron la 1ª opción la reprobó? (art. 112) */
export function reproboElTreinta(primeras: OpcionParaLaCuenta[], reglas: Pick<ReglasDePendientes, 'faltarPierdeElMomento'>, minima: number): boolean {
    const cuentan = primeras.filter((o) => laOpcionCuenta(o, reglas));
    return cuentan.length > 0 && cuentan.filter((o) => reprueba(o, minima)).length / cuentan.length >= 0.3;
}

/**
 * Recalcula el estado con la forma del liceo. Devuelve lo que hay que guardar.
 * Una nota vacía es un momento al que no se presentó («IN»): en el promedio
 * y en el ponderado cuenta como cero.
 */
export function estadoDeLaPendiente(
    notas: Array<{ momento: number; nota: number | null }>,
    reglas: Pick<ReglasDePendientes, 'momentos' | 'formaDeCalificar' | 'pesos'>,
    minima: number,
    redondeo: 'MPPE' | 'NINGUNO' = 'MPPE'
): { estado: 'PENDIENTE' | 'APROBADA' | 'NO_APROBADA'; notaFinal: number | null } {
    const redondear = (n: number) => (redondeo === 'NINGUNO' ? Math.round(n * 100) / 100 : redondearComoElMPPE(n));
    const ordenadas = [...notas].sort((a, b) => a.momento - b.momento);
    if (reglas.formaDeCalificar === 'PROMEDIO' || reglas.formaDeCalificar === 'PONDERADO') {
        if (ordenadas.length < reglas.momentos) return { estado: 'PENDIENTE', notaFinal: null };
        const usadas = ordenadas.slice(0, reglas.momentos);
        const valor =
            reglas.formaDeCalificar === 'PONDERADO' && reglas.pesos?.length === reglas.momentos
                ? usadas.reduce((s, n) => s + (n.nota ?? 0) * (reglas.pesos![n.momento - 1] ?? 0), 0) / 100
                : usadas.reduce((s, n) => s + (n.nota ?? 0), 0) / usadas.length;
        const final = redondear(valor);
        return { estado: final >= minima ? 'APROBADA' : 'NO_APROBADA', notaFinal: final };
    }
    const aprobado = ordenadas.find((n) => n.nota != null && n.nota >= minima);
    if (aprobado) return { estado: 'APROBADA', notaFinal: aprobado.nota };
    if (ordenadas.length >= reglas.momentos) {
        const conNota = ordenadas.map((n) => n.nota).filter((n): n is number => n != null);
        return { estado: 'NO_APROBADA', notaFinal: conNota.length ? Math.max(...conNota) : null };
    }
    return { estado: 'PENDIENTE', notaFinal: null };
}

/** Las del mismo grupo: las de su clase (o, sin clase, las de su materia, grado y año). */
const delGrupo = (p: { claseId: string | null; subjectId: string; gradoDeOrigen: number; cicloId: string }) =>
    p.claseId ? { claseId: p.claseId } : { claseId: null, subjectId: p.subjectId, gradoDeOrigen: p.gradoDeOrigen, cicloId: p.cicloId };
const claveDelGrupo = (p: { claseId: string | null; subjectId: string; gradoDeOrigen: number; cicloId: string }) =>
    p.claseId ?? `${p.subjectId}|${p.gradoDeOrigen}|${p.cicloId}`;

/**
 * Las 1ª opciones de cada grupo y momento, en bloque: para saber si se abrió la
 * 2ª con SI_REPRUEBA_30.
 */
async function primerasDeLosGrupos(tx: any, pendientes: any[]): Promise<Map<string, OpcionParaLaCuenta[]>> {
    const grupos = new Map(pendientes.map((p) => [claveDelGrupo(p), delGrupo(p)]));
    const primeras = await tx.opcionDePendiente.findMany({
        where: { opcion: 1, materiaPendiente: { OR: [...grupos.values()] } },
        select: {
            momento: true,
            opcion: true,
            nota: true,
            asistio: true,
            justificada: true,
            fecha: true,
            materiaPendiente: { select: { claseId: true, subjectId: true, gradoDeOrigen: true, cicloId: true } },
        },
    });
    const m = new Map<string, OpcionParaLaCuenta[]>();
    for (const o of primeras) {
        const clave = `${claveDelGrupo(o.materiaPendiente)}|${o.momento}`;
        m.set(clave, [...(m.get(clave) ?? []), o]);
    }
    return m;
}

/** ¿Tiene 2ª opción este momento? */
function segundaAbiertaPara(p: any, momento: number, reglas: ReglasDePendientes, minima: number, primeras: Map<string, OpcionParaLaCuenta[]>, opcionesDeP: any[]) {
    if (reglas.segundaOpcion === 'NO') return false;
    // Si ya se siguió a otro momento, este quedó decidido así.
    if (opcionesDeP.some((o: any) => o.momento > momento)) return false;
    if (reglas.segundaOpcion === 'SIEMPRE') return true;
    return reproboElTreinta(primeras.get(`${claveDelGrupo(p)}|${momento}`) ?? [], reglas, minima);
}

/**
 * Recalcula varias pendientes a la vez: la nota de cada momento con opciones
 * (la de los momentos puestos a mano no se toca) y su estado.
 */
export async function recalcular(tx: any, config: AcademicConfig, ids: string[]) {
    const reglas = config.pendientes;
    const minima = config.notaMinimaAprobatoria;
    const pendientes = await tx.materiaPendiente.findMany({
        where: { id: { in: ids } },
        select: {
            id: true,
            claseId: true,
            subjectId: true,
            gradoDeOrigen: true,
            cicloId: true,
            estado: true,
            notaFinal: true,
            opciones: true,
            evaluaciones: { select: { id: true, momento: true, nota: true } },
        },
    });
    const primeras = reglas.segundaOpcion === 'SI_REPRUEBA_30' ? await primerasDeLosGrupos(tx, pendientes) : new Map();
    const resultado = new Map<string, { estado: 'PENDIENTE' | 'APROBADA' | 'NO_APROBADA'; notaFinal: number | null }>();
    for (const p of pendientes) {
        const notas = new Map<number, number | null>(p.evaluaciones.map((e: any) => [e.momento, e.nota]));
        const conOpciones = [...new Set<number>(p.opciones.map((o: any) => o.momento))];
        for (const m of conOpciones) {
            const o1 = p.opciones.find((o: any) => o.momento === m && o.opcion === 1);
            const o2 = p.opciones.find((o: any) => o.momento === m && o.opcion === 2);
            const r = elMomento(o1, o2, reglas, minima, segundaAbiertaPara(p, m, reglas, minima, primeras, p.opciones));
            if (r.decidido) {
                await tx.evaluacionDePendiente.upsert({
                    where: { materiaPendienteId_momento: { materiaPendienteId: p.id, momento: m } },
                    update: { nota: r.nota, fecha: r.fecha, registradaPorId: r.registradaPorId },
                    create: { materiaPendienteId: p.id, momento: m, nota: r.nota, fecha: r.fecha, registradaPorId: r.registradaPorId },
                });
                notas.set(m, r.nota);
            } else if (notas.has(m)) {
                // El momento volvió a quedar abierto (sus opciones siguen ahí): su nota se va, con copia.
                await borrarGuardandoCopia(tx, 'evaluacionDePendiente', { materiaPendienteId: p.id, momento: m }, { motivo: 'el momento de la pendiente volvió a quedar abierto' });
                notas.delete(m);
            }
        }
        const nuevo = estadoDeLaPendiente(
            [...notas.entries()].map(([momento, nota]) => ({ momento, nota })),
            reglas,
            minima,
            config.redondeoDeDefinitivas
        );
        if (nuevo.estado !== p.estado || nuevo.notaFinal !== p.notaFinal) await tx.materiaPendiente.update({ where: { id: p.id }, data: nuevo });
        resultado.set(p.id, nuevo);
    }
    return resultado;
}

export const notaDelLiceo = (config: AcademicConfig, n: number) => (config.redondeoDeDefinitivas === 'NINGUNO' ? Math.round(n * 100) / 100 : redondearComoElMPPE(n));

export function revisarNota(nota: unknown) {
    if (typeof nota !== 'number' || !Number.isFinite(nota) || nota < 0 || nota > NOTA_MAXIMA) {
        throw createError(400, `La nota va de 0 a ${NOTA_MAXIMA}`, 'NOTA_INVALIDA');
    }
}

// ── A MANO: LA NOTA DEL MOMENTO, DIRECTA (la forma de antes) ───────────────

/** Pone (o corrige) la nota de un momento, sin opciones. */
export async function evaluarMomento(
    prisma: PrismaClient | any,
    instituteId: string,
    quien: QuienPide,
    datos: { id: string; momento: number; nota: unknown; fecha: string; observaciones?: string | null }
) {
    const p = await laPendiente(prisma, datos.id);
    puedeEvaluar(p, quien);
    if (p.ciclo.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    const config = await getAcademicConfig(instituteId);
    if (!Number.isInteger(datos.momento) || datos.momento < 1 || datos.momento > config.pendientes.momentos) {
        throw createError(400, `Los momentos van del 1 al ${config.pendientes.momentos}`, 'MOMENTO_INVALIDO');
    }
    revisarNota(datos.nota);
    if (p.opciones.some((o: any) => o.momento === datos.momento)) {
        throw createError(409, 'Ese momento va por opciones (1ª y 2ª): ponlas allí', 'MOMENTO_CON_OPCIONES');
    }
    const yaEsta = p.evaluaciones.find((e: any) => e.momento === datos.momento);
    // Aprobada, ya no hay más momentos: solo se corrige uno que ya estaba.
    if (p.estado === 'APROBADA' && !yaEsta) {
        throw createError(409, 'La materia ya está aprobada', 'YA_APROBADA');
    }
    // Los momentos van en orden: no se salta uno.
    const anteriores = p.evaluaciones.filter((e: any) => e.momento < datos.momento).length;
    if (!yaEsta && anteriores < datos.momento - 1) {
        throw createError(400, `Primero el momento ${anteriores + 1}`, 'MOMENTO_INVALIDO');
    }
    const nota = notaDelLiceo(config, datos.nota as number);
    const fecha = new Date(`${datos.fecha}T00:00:00.000Z`);
    return prisma.$transaction(async (tx: any) => {
        await tx.evaluacionDePendiente.upsert({
            where: { materiaPendienteId_momento: { materiaPendienteId: p.id, momento: datos.momento } },
            update: { nota, fecha, observaciones: datos.observaciones ?? null, registradaPorId: quien.id },
            create: {
                materiaPendienteId: p.id,
                momento: datos.momento,
                nota,
                fecha,
                observaciones: datos.observaciones ?? null,
                registradaPorId: quien.id,
            },
        });
        return (await recalcular(tx, config, [p.id])).get(p.id)!;
    });
}

/** Quita el último momento puesto (a mano o con sus opciones), con copia en la papelera, y recalcula. */
export async function quitarMomento(prisma: any, instituteId: string, quien: QuienPide, id: string, momento: number) {
    const p = await laPendiente(prisma, id);
    puedeEvaluar(p, quien);
    if (p.ciclo.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    const ultimo = Math.max(0, ...p.evaluaciones.map((e: any) => e.momento), ...p.opciones.map((o: any) => o.momento));
    if (momento !== ultimo) throw createError(409, 'Solo se quita el último momento puesto', 'NO_ES_EL_ULTIMO');
    const config = await getAcademicConfig(instituteId);
    return prisma.$transaction(async (tx: any) => {
        const copia = { usuarioId: quien.id, motivo: 'momento de materia pendiente quitado' };
        const opciones = await borrarGuardandoCopia(tx, 'opcionDePendiente', { materiaPendienteId: id, momento }, copia);
        const n = await borrarGuardandoCopia(tx, 'evaluacionDePendiente', { materiaPendienteId: id, momento }, copia);
        if (n === 0 && opciones === 0) throw createError(404, 'Ese momento no tiene nota', 'NOT_FOUND');
        return (await recalcular(tx, config, [id])).get(id)!;
    });
}

// ── LAS OPCIONES DE CADA MOMENTO (1ª y 2ª) ─────────────────────────────────

export interface DatosDeLaOpcion {
    id: string;
    momento: number;
    opcion: number;
    nota?: unknown;
    asistio: boolean;
    justificada?: boolean;
    fecha: string;
    observaciones?: string | null;
}

/**
 * Pone (o corrige) la 1ª o la 2ª opción de un momento. Va en orden: el
 * momento anterior tiene que estar decidido; la 2ª, solo con la 1ª reprobada
 * y abierta según el liceo. Con SI_REPRUEBA_30, cambiar una 1ª puede abrir o
 * cerrar la 2ª de todo el grupo: se recalcula el grupo.
 */
export async function ponerOpcion(prisma: any, instituteId: string, quien: QuienPide, datos: DatosDeLaOpcion) {
    const p = await laPendiente(prisma, datos.id);
    puedeEvaluar(p, quien);
    if (p.ciclo.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    const config = await getAcademicConfig(instituteId);
    const reglas = config.pendientes;
    const minima = config.notaMinimaAprobatoria;
    const { momento, opcion } = datos;
    if (!Number.isInteger(momento) || momento < 1 || momento > reglas.momentos) {
        throw createError(400, `Los momentos van del 1 al ${reglas.momentos}`, 'MOMENTO_INVALIDO');
    }
    if (opcion !== 1 && opcion !== 2) throw createError(400, 'La opción es la 1ª o la 2ª', 'OPCION_INVALIDA');
    if (datos.asistio) revisarNota(datos.nota);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha ?? '')) throw createError(400, 'La fecha va como AAAA-MM-DD', 'FECHA_INVALIDA');

    await validarLaOpcion(prisma, p, config, momento, opcion);

    const valores = {
        nota: datos.asistio ? notaDelLiceo(config, datos.nota as number) : null,
        asistio: datos.asistio,
        justificada: !datos.asistio && datos.justificada === true,
        delPlan: false,
        fecha: new Date(`${datos.fecha}T00:00:00.000Z`),
        observaciones: datos.observaciones?.trim() ? datos.observaciones.trim().slice(0, 300) : null,
        registradaPorId: quien.id,
    };
    return prisma.$transaction(async (tx: any) => {
        await tx.opcionDePendiente.upsert({
            where: { materiaPendienteId_momento_opcion: { materiaPendienteId: p.id, momento, opcion } },
            update: valores,
            create: { materiaPendienteId: p.id, momento, opcion, ...valores },
        });
        return (await recalcular(tx, config, await losAfectados(tx, p, config, momento, opcion))).get(p.id)!;
    });
}

/**
 * ¿Se puede trabajar esta opción de este momento? (corta con 400/409 si no).
 * Va en orden: el momento anterior decidido; la 2ª, con la 1ª reprobada y
 * abierta según el liceo; la 1ª de un momento nuevo, sin la materia aprobada.
 */
export async function validarLaOpcion(prisma: any, p: any, config: AcademicConfig, momento: number, opcion: number) {
    const reglas = config.pendientes;
    const minima = config.notaMinimaAprobatoria;
    const yaEsta = p.opciones.find((o: any) => o.momento === momento && o.opcion === opcion);
    const aMano = p.evaluaciones.find((e: any) => e.momento === momento) && !p.opciones.some((o: any) => o.momento === momento);
    if (aMano) throw createError(409, 'Ese momento se puso a mano: quítalo primero', 'MOMENTO_A_MANO');

    if (opcion === 2) {
        const o1 = p.opciones.find((o: any) => o.momento === momento && o.opcion === 1);
        const reprobo = o1 && laOpcionCuenta(o1, reglas) && (o1.nota == null || o1.nota < minima);
        const primeras = reglas.segundaOpcion === 'SI_REPRUEBA_30' ? await primerasDeLosGrupos(prisma, [p]) : new Map();
        if (!reprobo || !segundaAbiertaPara(p, momento, reglas, minima, primeras, p.opciones)) {
            throw createError(
                409,
                reglas.segundaOpcion === 'NO'
                    ? 'En este liceo no hay 2ª opción'
                    : !reprobo
                      ? 'La 2ª opción es para quien reprobó la 1ª'
                      : 'La 2ª opción no se abrió: menos del 30 % reprobó la 1ª',
                'SIN_SEGUNDA_OPCION'
            );
        }
    } else if (!yaEsta) {
        if (p.estado === 'APROBADA') throw createError(409, 'La materia ya está aprobada', 'YA_APROBADA');
        const decididos = new Set(p.evaluaciones.map((e: any) => e.momento));
        if (momento > 1 && !decididos.has(momento - 1)) throw createError(400, `Primero el momento ${momento - 1}`, 'MOMENTO_INVALIDO');
        if (decididos.has(momento)) throw createError(409, 'Ese momento ya está decidido', 'MOMENTO_INVALIDO');
    }
}

/** A quiénes hay que recalcular al tocar una opción: a ella y, con SI_REPRUEBA_30 y una 1ª, a su grupo. */
export async function losAfectados(tx: any, p: any, config: AcademicConfig, momento: number, opcion: number): Promise<string[]> {
    if (config.pendientes.segundaOpcion !== 'SI_REPRUEBA_30' || opcion !== 1) return [p.id];
    const grupo = await tx.materiaPendiente.findMany({ where: { ...delGrupo(p), opciones: { some: { momento } } }, select: { id: true } });
    return [...new Set([p.id, ...grupo.map((g: any) => g.id)])];
}

/** Quita la última opción puesta (con copia en la papelera) y recalcula. */
export async function quitarOpcion(prisma: any, instituteId: string, quien: QuienPide, id: string, momento: number, opcion: number) {
    const p = await laPendiente(prisma, id);
    puedeEvaluar(p, quien);
    if (p.ciclo.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    const ultima = [...p.opciones].sort((a: any, b: any) => b.momento - a.momento || b.opcion - a.opcion)[0];
    if (!ultima || ultima.momento !== momento || ultima.opcion !== opcion) throw createError(409, 'Solo se quita la última opción puesta', 'NO_ES_EL_ULTIMO');
    const config = await getAcademicConfig(instituteId);
    return prisma.$transaction(async (tx: any) => {
        await borrarGuardandoCopia(tx, 'opcionDePendiente', { materiaPendienteId: id, momento, opcion }, { usuarioId: quien.id, motivo: 'opción de materia pendiente quitada' });
        // Sin su 1ª opción, el momento no tiene de dónde salir: su nota se va también.
        if (opcion === 1) {
            await borrarGuardandoCopia(tx, 'evaluacionDePendiente', { materiaPendienteId: id, momento }, { usuarioId: quien.id, motivo: 'opción de materia pendiente quitada' });
        }
        return (await recalcular(tx, config, await losAfectados(tx, p, config, momento, opcion))).get(id)!;
    });
}

// ── LA CLASE Y LA SECCIÓN ──────────────────────────────────────────────────

/**
 * Las pendientes de una clase (la pestaña «Pendientes» de la materia): las ve
 * el admin y el profesor de la clase. Con las reglas, el cronograma, si la 2ª
 * opción está abierta en cada momento y, al admin, las otras clases de la
 * misma materia y grado a las que puede pasarlas.
 */
export async function pendientesDeLaClase(prisma: any, instituteId: string, quien: QuienPide, claseId: string) {
    const clase = await prisma.classroomSubject.findUnique({
        where: { id: claseId },
        select: {
            id: true,
            subjectId: true,
            teacherId: true,
            subject: { select: { name: true } },
            teacher: { select: { id: true, firstName: true, lastName: true } },
            classroom: { select: { name: true, grade: true, academicYearId: true, academicYear: { select: { id: true, name: true, status: true } } } },
        },
    });
    if (!clase) throw createError(404, 'Clase no encontrada', 'NOT_FOUND');
    const cicloId = clase.classroom.academicYearId;
    await asignarLasClases(prisma, cicloId);
    const esSuya = quien.role === 'TEACHER' && clase.teacherId === quien.id;
    const filasDeOtros = quien.role === 'TEACHER' && !esSuya ? await prisma.materiaPendiente.count({ where: { claseId, profesorId: quien.id } }) : 0;
    if (quien.role !== 'ADMIN' && !esSuya && filasDeOtros === 0) {
        throw createError(403, 'Las pendientes de esta clase las ve su profesor', 'FORBIDDEN');
    }
    const config = await getAcademicConfig(instituteId);
    const reglas = config.pendientes;
    const filas = await prisma.materiaPendiente.findMany({
        where: { claseId, ...(quien.role === 'ADMIN' || (esSuya && quien.role === 'TEACHER') ? {} : { profesorId: quien.id }) },
        include: incluir,
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    const primeras = reglas.segundaOpcion === 'SI_REPRUEBA_30' && filas.length ? await primerasDeLosGrupos(prisma, filas.slice(0, 1)) : new Map();
    const segundaAbierta = Array.from({ length: reglas.momentos }, (_, i) =>
        reglas.segundaOpcion === 'SIEMPRE' ? true : reglas.segundaOpcion === 'NO' ? false : reproboElTreinta(primeras.get(`${claseId}|${i + 1}`) ?? [], reglas, config.notaMinimaAprobatoria)
    );
    const otrasClases =
        quien.role === 'ADMIN'
            ? await prisma.classroomSubject.findMany({
                  where: { subjectId: clase.subjectId, id: { not: claseId }, classroom: { academicYearId: cicloId, grade: clase.classroom.grade } },
                  select: { id: true, teacher: { select: { firstName: true, lastName: true } }, classroom: { select: { name: true } } },
                  orderBy: { classroom: { section: 'asc' } },
              })
            : [];
    return {
        clase: {
            id: clase.id,
            materia: clase.subject.name,
            seccion: clase.classroom.name,
            grado: clase.classroom.grade,
            profesor: clase.teacher ? { id: clase.teacher.id, nombre: `${clase.teacher.firstName} ${clase.teacher.lastName}` } : null,
        },
        ciclo: { id: clase.classroom.academicYear.id, nombre: clase.classroom.academicYear.name, cerrado: clase.classroom.academicYear.status === 'COMPLETED' },
        reglas,
        minima: config.notaMinimaAprobatoria,
        cronograma: await cronogramaDelCiclo(prisma, cicloId, reglas.momentos),
        segundaAbierta,
        puedeEvaluar: quien.role === 'ADMIN' || esSuya || filasDeOtros > 0,
        otrasClases: otrasClases.map((c: any) => ({
            id: c.id,
            seccion: c.classroom.name,
            profesor: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName}` : null,
        })),
        pendientes: await comoFilas(prisma, filas),
    };
}

/**
 * Las pendientes de los alumnos de una sección (su pestaña): las ve el admin
 * y el guía de la sección. Solo lectura.
 */
export async function pendientesDeLaSeccion(prisma: any, quien: QuienPide, classroomId: string) {
    const seccion = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { id: true, teacherId: true, academicYearId: true } });
    if (!seccion) throw createError(404, 'Sección no encontrada', 'NOT_FOUND');
    if (quien.role !== 'ADMIN' && !(quien.role === 'TEACHER' && seccion.teacherId === quien.id)) {
        throw createError(403, 'Las pendientes de la sección las ven el admin y su profesor guía', 'FORBIDDEN');
    }
    await asignarLasClases(prisma, seccion.academicYearId);
    const alumnos = await prisma.studentClassroom.findMany({
        where: { classroomId, isActive: true },
        select: { studentId: true },
    });
    const filas = alumnos.length
        ? await prisma.materiaPendiente.findMany({
              where: { cicloId: seccion.academicYearId, studentId: { in: alumnos.map((a: any) => a.studentId) } },
              include: incluir,
              orderBy: [{ student: { lastName: 'asc' } }, { gradoDeOrigen: 'asc' }, { subject: { name: 'asc' } }],
          })
        : [];
    return { pendientes: await comoFilas(prisma, filas) };
}

/** El admin la pasa a otra clase de la misma materia y grado (de ese año): la evalúa ese profesor. */
export async function moverDeClase(prisma: any, id: string, claseId: string) {
    const p = await laPendiente(prisma, id);
    if (p.ciclo.status === 'COMPLETED') throw createError(409, 'El año escolar ya se cerró', 'CICLO_CERRADO');
    const clase = await prisma.classroomSubject.findUnique({ where: { id: claseId }, select: { subjectId: true, classroom: { select: { grade: true, academicYearId: true } } } });
    if (!clase || clase.subjectId !== p.subjectId || clase.classroom.grade !== p.gradoDeOrigen || clase.classroom.academicYearId !== p.cicloId) {
        throw createError(400, 'Va a una clase de la misma materia y del mismo grado, en el mismo año', 'CLASE_INVALIDA');
    }
    await prisma.materiaPendiente.update({ where: { id }, data: { claseId, profesorId: null } });
    return comoFila(await laPendiente(prisma, id));
}

/** El admin cambia quién la evalúa a mano (la forma de antes): manda sobre el de la clase. */
export async function asignarProfesor(prisma: any, id: string, profesorId: string | null) {
    await laPendiente(prisma, id);
    if (profesorId) {
        const profe = await prisma.user.findUnique({ where: { id: profesorId }, select: { role: true, isActive: true } });
        if (!profe || profe.role !== 'TEACHER' || !profe.isActive) throw createError(400, 'Ese no es un profesor activo', 'PROFESOR_INVALIDO');
    }
    await prisma.materiaPendiente.update({ where: { id }, data: { profesorId } });
    return comoFila(await laPendiente(prisma, id));
}

// ── EL CRONOGRAMA ──────────────────────────────────────────────────────────

export interface MomentoDelCronograma {
    numero: number;
    desde1: string;
    hasta1: string;
    desde2: string | null;
    hasta2: string | null;
}

const ymdDe = (d: Date) => d.toISOString().slice(0, 10);
const masDias = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** El n-ésimo lunes de un mes (UTC). */
function lunes(ano: number, mes: number, n = 1): Date {
    const primero = new Date(Date.UTC(ano, mes, 1));
    const hasta = (8 - primero.getUTCDay()) % 7; // días hasta el primer lunes
    return masDias(primero, hasta + (n - 1) * 7);
}

/**
 * Las fechas que se proponen sin guardar nada: las de la Circular 0007 (una
 * semana en octubre, diciembre, enero y junio, y la 2ª opción la semana
 * siguiente). Con otro número de momentos, repartidos de octubre a junio.
 */
export function cronogramaPropuesto(inicioDelAno: Date, momentos: number): MomentoDelCronograma[] {
    const ano = inicioDelAno.getUTCMonth() >= 6 ? inicioDelAno.getUTCFullYear() : inicioDelAno.getUTCFullYear() - 1;
    const semanas: Date[] =
        momentos === 4
            ? [lunes(ano, 9), lunes(ano, 11), lunes(ano + 1, 0, 4), lunes(ano + 1, 5)]
            : Array.from({ length: momentos }, (_, i) => {
                  const mes = 9 + (momentos === 1 ? 8 : Math.round((i * 8) / (momentos - 1)));
                  return lunes(ano + Math.floor(mes / 12), mes % 12);
              });
    return semanas.map((d, i) => ({
        numero: i + 1,
        desde1: ymdDe(d),
        hasta1: ymdDe(masDias(d, 4)),
        desde2: ymdDe(masDias(d, 7)),
        hasta2: ymdDe(masDias(d, 11)),
    }));
}

async function cronogramaDelCiclo(prisma: any, cicloId: string, momentos: number) {
    const ciclo = await prisma.academicYear.findUnique({ where: { id: cicloId }, select: { id: true, name: true, startDate: true } });
    if (!ciclo) return { cicloId: null, ciclo: null, propuesto: true, momentos: [] as MomentoDelCronograma[] };
    const guardados = await prisma.momentoDePendiente.findMany({ where: { cicloId }, orderBy: { numero: 'asc' } });
    const propuesto = cronogramaPropuesto(ciclo.startDate, momentos);
    const lista = propuesto.map(
        (m) => {
            const g = guardados.find((x: any) => x.numero === m.numero);
            return g ? { numero: g.numero, desde1: ymdDe(g.desde1), hasta1: ymdDe(g.hasta1), desde2: g.desde2 ? ymdDe(g.desde2) : null, hasta2: g.hasta2 ? ymdDe(g.hasta2) : null } : m;
        }
    );
    return { cicloId: ciclo.id, ciclo: ciclo.name, propuesto: guardados.length === 0, momentos: lista };
}

/** El cronograma de un año (el en curso si no se dice): lo guardado o lo que se propone. */
export async function cronograma(prisma: any, instituteId: string, cicloId?: string) {
    const id = cicloId ?? (await cicloEnCurso(prisma));
    const config = await getAcademicConfig(instituteId);
    if (!id) return { cicloId: null, ciclo: null, propuesto: true, momentos: [] as MomentoDelCronograma[] };
    return cronogramaDelCiclo(prisma, id, config.pendientes.momentos);
}

/** El admin guarda las fechas de los momentos de un año. Cada ventana, de su inicio a su fin; la 2ª, después de la 1ª. */
export async function guardarCronograma(prisma: any, instituteId: string, quien: QuienPide, cicloId: string, momentos: MomentoDelCronograma[]) {
    const ciclo = await prisma.academicYear.findUnique({ where: { id: cicloId }, select: { id: true } });
    if (!ciclo) throw createError(404, 'Año escolar no encontrado', 'NOT_FOUND');
    const config = await getAcademicConfig(instituteId);
    const fecha = /^\d{4}-\d{2}-\d{2}$/;
    const numeros = new Set<number>();
    for (const m of momentos) {
        const bien =
            Number.isInteger(m.numero) &&
            m.numero >= 1 &&
            m.numero <= config.pendientes.momentos &&
            !numeros.has(m.numero) &&
            fecha.test(m.desde1) &&
            fecha.test(m.hasta1) &&
            m.desde1 <= m.hasta1 &&
            (m.desde2 == null) === (m.hasta2 == null) &&
            (m.desde2 == null || (fecha.test(m.desde2) && fecha.test(m.hasta2!) && m.desde2 <= m.hasta2! && m.desde2 > m.hasta1));
        if (!bien) throw createError(400, `Las fechas del momento ${m.numero} no cuadran: cada opción va de su inicio a su fin, y la 2ª después de la 1ª`, 'FECHAS_INVALIDAS');
        numeros.add(m.numero);
    }
    const dia = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
    await prisma.$transaction(async (tx: any) => {
        for (const m of momentos) {
            const datos = { desde1: dia(m.desde1)!, hasta1: dia(m.hasta1)!, desde2: dia(m.desde2), hasta2: dia(m.hasta2) };
            await tx.momentoDePendiente.upsert({
                where: { cicloId_numero: { cicloId, numero: m.numero } },
                update: datos,
                create: { cicloId, numero: m.numero, ...datos },
            });
        }
        // Los momentos de más (el liceo bajó cuántos hay) se van, con su copia.
        await borrarGuardandoCopia(tx, 'momentoDePendiente', { cicloId, numero: { gt: config.pendientes.momentos } }, { usuarioId: quien.id, motivo: 'momento del cronograma de pendientes que ya no existe' });
    });
    return cronogramaDelCiclo(prisma, cicloId, config.pendientes.momentos);
}

/**
 * El acta de compromiso de un alumno: sus materias pendientes de un año, con
 * quién las evalúa. De aquí sale la hoja que firman el alumno, su
 * representante y los docentes.
 */
export async function actaDeCompromiso(prisma: any, studentId: string, cicloId?: string) {
    const alumno = await prisma.user.findUnique({
        where: { id: studentId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            studentTutorings: { select: { relationship: true, tutor: { select: { firstName: true, lastName: true, id: true } } } },
        },
    });
    if (!alumno || alumno.role !== 'STUDENT') throw createError(404, 'Estudiante no encontrado', 'NOT_FOUND');
    const ciclo = cicloId ?? (await cicloEnCurso(prisma));
    if (ciclo) await asignarLasClases(prisma, ciclo);
    const filas = ciclo
        ? await prisma.materiaPendiente.findMany({ where: { studentId, cicloId: ciclo }, include: incluir, orderBy: { gradoDeOrigen: 'asc' } })
        : [];
    const inscripcion = ciclo
        ? await prisma.studentClassroom.findUnique({
              where: { studentId_academicYearId: { studentId, academicYearId: ciclo } },
              select: { classroom: { select: { name: true } } },
          })
        : null;
    return {
        alumno: { cedula: alumno.id, nombre: `${alumno.firstName} ${alumno.lastName}` },
        representantes: (alumno.studentTutorings ?? []).map((t: any) => ({
            nombre: `${t.tutor.firstName} ${t.tutor.lastName}`,
            cedula: t.tutor.id,
            parentesco: t.relationship,
        })),
        seccion: inscripcion?.classroom?.name ?? null,
        ciclo: filas[0]?.ciclo?.name ?? null,
        pendientes: filas.map((p: any) => comoFila(p, inscripcion?.classroom?.name ?? null)),
    };
}
