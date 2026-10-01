/**
 * ¿A QUÉ EVALUACIÓN DEL PLAN SUMA UNA ACTIVIDAD?
 *
 * La regla (Cristian, 2026-09-27): las actividades que el profesor hace en la
 * semana de una evaluación del plan suman a esa evaluación; su nota es el
 * promedio de ellas llevado a los puntos de la evaluación
 * (`utils/lapso-average.ts`). Una actividad en una semana SIN evaluación se
 * guarda y se califica, pero no suma a la nota del lapso, y se dice.
 *
 * Antes se buscaba la fila de la semana EXACTA y se tomaba la primera: una
 * evaluación unida a varias semanas solo recogía las de la primera (las demás
 * caían en una fila vacía, de 0 puntos, y no contaban), y con dos evaluaciones
 * en la semana todo iba a la primera (SEMEVAL-*).
 *
 * Una fila cubre desde su semana hasta la última que tenga unida en la
 * columna de la actividad o de los puntos (`extraData.__uniones`). No vale
 * `endWeekNumber`: es la unión más ancha de CUALQUIER columna (el tema
 * generador suele abarcar el lapso entero).
 */
import { semanaDelPlan } from './semana-del-plan.service';
import { diaDeLaActividad } from '../utils/actividad-del-dia';

const COLUMNAS_DE_LA_EVALUACION = ['actividadEval', 'puntos', 'ponderacion'];

export function semanasQueCubre(fila: { extraData?: string | null }): number {
    let uniones: Record<string, number> = {};
    try {
        const extra = fila.extraData ? JSON.parse(fila.extraData) : null;
        uniones = (extra?.__uniones as Record<string, number>) ?? {};
    } catch {
        /* sin uniones */
    }
    return Math.max(1, ...COLUMNAS_DE_LA_EVALUACION.map((c) => Number(uniones[c]) || 1));
}

/** Las evaluaciones (con puntos) que cubren esa semana. */
export function criteriosQueCubren<T extends { weekNumber: number | null; puntos?: number | null; extraData?: string | null; rowType?: string }>(
    filas: T[],
    semana: number
): T[] {
    return filas.filter((f) => {
        if (f.rowType && f.rowType !== 'EVALUATION') return false;
        if (!f.puntos || f.puntos <= 0 || f.weekNumber == null) return false;
        return f.weekNumber <= semana && semana < f.weekNumber + semanasQueCubre(f);
    });
}

export interface EvaluacionesDeLaFecha {
    lapso: string | null;
    semana: number | null;
    /** ¿El plan del lapso tiene evaluaciones con puntos? Sin eso, toda actividad cuenta. */
    planConPuntos: boolean;
    evaluaciones: Array<{ id: string; actividad: string; puntos: number; semana: number; instrumentos: string | null; tipoDeInstrumento: string | null }>;
}

/** Las evaluaciones del plan a las que puede sumar una actividad de ese día. */
export async function evaluacionesDeLaFecha(prisma: any, classroomId: string, subjectId: string, fecha: Date): Promise<EvaluacionesDeLaFecha> {
    const [base, metas] = await Promise.all([
        semanaDelPlan(prisma, classroomId, fecha),
        prisma.evaluationPlanMetadata.findMany({ where: { classroomId, subjectId }, orderBy: { lapso: 'asc' } }),
    ]);
    const meta = base.lapso ? metas.find((m: any) => m.lapso === base.lapso) ?? null : metas[0] ?? null;
    if (!meta) return { lapso: base.lapso ?? null, semana: null, planConPuntos: false, evaluaciones: [] };
    const sem = meta.fechaDesde ? await semanaDelPlan(prisma, classroomId, fecha, new Date(meta.fechaDesde)) : base;
    const filas = await prisma.evaluationPlanRow.findMany({
        where: { classroomId, subjectId, lapso: meta.lapso, rowType: 'EVALUATION' },
        select: { id: true, weekNumber: true, puntos: true, extraData: true, actividadEval: true, instrumentos: true, rowType: true, orderIndex: true, instrumento: { select: { tipo: true } } },
        orderBy: [{ weekNumber: 'asc' }, { orderIndex: 'asc' }],
    });
    const planConPuntos = filas.some((f: any) => (f.puntos ?? 0) > 0);
    const dentro = sem.inicioDelPlan && !sem.antesDelPlan;
    const cubren = dentro ? criteriosQueCubren(filas, sem.semana) : [];
    return {
        lapso: meta.lapso,
        semana: dentro ? sem.semana : null,
        planConPuntos,
        evaluaciones: cubren.map((f: any) => ({
            id: f.id,
            actividad: f.actividadEval || '',
            puntos: f.puntos,
            semana: f.weekNumber,
            instrumentos: f.instrumentos ?? null,
            tipoDeInstrumento: f.instrumento?.tipo ?? null,
        })),
    };
}

/**
 * LAS QUE QUEDARON SIN SUMAR
 *
 * Con la búsqueda de antes (semana exacta, primera fila), una actividad de la
 * segunda semana de una evaluación unida quedaba en la fila vacía de su semana
 * (0 puntos) o sin fila, y su nota no contaba. Esto las vuelve a enganchar
 * cuando UNA sola evaluación cubre su semana. Cambia promedios: por eso va en
 * seco salvo que se pida (`scripts/reenlazar-actividades-al-plan.ts`).
 */
export async function reenlazarActividades(prisma: any, zona: string, aplicar: boolean) {
    const sueltas = await prisma.classActivity.findMany({
        where: { OR: [{ planRowId: null }, { planRow: { OR: [{ puntos: null }, { puntos: { lte: 0 } }] } }] },
        select: {
            id: true,
            title: true,
            classroomId: true,
            subjectId: true,
            target: true,
            dueDate: true,
            createdAt: true,
            planRowId: true,
            classSessionId: true,
            classSession: { select: { date: true } },
        },
    });
    const cambios: Array<{ id: string; titulo: string; de: string | null; a: string }> = [];
    for (const a of sueltas) {
        const dia = a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : diaDeLaActividad(a, zona);
        const [y, m, d] = dia.split('-').map(Number);
        const { evaluaciones } = await evaluacionesDeLaFecha(prisma, a.classroomId, a.subjectId, new Date(y, m - 1, d, 12));
        if (evaluaciones.length !== 1 || evaluaciones[0].id === a.planRowId) continue;
        cambios.push({ id: a.id, titulo: a.title, de: a.planRowId, a: evaluaciones[0].id });
        if (aplicar) await prisma.classActivity.update({ where: { id: a.id }, data: { planRowId: evaluaciones[0].id } });
    }
    return cambios;
}
