import { planWeekRangeFromRange } from '@/lib/plan-weeks';
import type { EvaluationPlanRow } from '@/hooks/useEvaluationPlan';
import { DEFAULT_PLAN_COLUMNS, type PlanColumnDef } from './planColumns';

/**
 * EL PLAN, DE FILAS DE LA BASE A SEMANAS
 *
 * Lo usan el editor del profesor (`EvaluationPlanSection`) y lo que ve el
 * alumno de su materia («Mi clase»): tienen que leer el plan igual, uniones de
 * semanas incluidas.
 */

type ColDef = PlanColumnDef;

// Row stored in state: one entry per week (indexed by weekNumber)
// mergeSpan > 1 means "this cell spans N weeks downward" (rowSpan)
// hiddenByMerge = true means the row above has claimed this cell
export interface WeekRow {
  id?: string;
  activityId?: string;
  weekNumber: number;
  data: Record<string, string | number>;
  /** Per-column span configuration: colKey → number of weeks it spans */
  colSpan: Record<string, number>;
}

// ────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────
// CORRECCIÓN (reporte usuario): semanas del plan alineadas a LUNES.
// Semana 1 = desde la fecha de inicio hasta el domingo previo al primer lunes
// posterior a la semana inicial (ej: inicio 19/08 → semana 1: 19-30/08);
// Semana 2 abre el LUNES 31/08 (semana lun→dom). Ver lib/plan-weeks.ts.
export function getWeekDates(lapsoStart: string | undefined, weekNumber: number): { start: string; end: string } | null {
  if (!lapsoStart) return null;
  const range = planWeekRangeFromRange(new Date(lapsoStart), weekNumber);
  const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return { start: fmt(range.start), end: fmt(range.end) };
}

export function buildEmptyWeekRows(totalWeeks: number): WeekRow[] {
  return Array.from({ length: totalWeeks }, (_, i) => ({
    weekNumber: i + 1,
    data: {},
    colSpan: {},
  }));
}

/** Converts flat EvaluationPlanRow[] (from DB) → WeekRow[] */
export function dbRowsToWeekRows(dbRows: Partial<EvaluationPlanRow>[], totalWeeks: number): WeekRow[] {
  const base = buildEmptyWeekRows(totalWeeks);
  const sorted = [...dbRows].sort((a, b) => {
    if (a.rowType === 'EVALUATION') return 1;
    if (b.rowType === 'EVALUATION') return -1;
    return 0;
  });

  sorted.forEach(r => {
    const wn = (r.weekNumber || 1) - 1;
    if (wn < 0 || wn >= base.length) return;
    if (r.id) base[wn].id = r.id;
    if (r.activityId) base[wn].activityId = r.activityId;
    const span = r.endWeekNumber ? Math.max(1, r.endWeekNumber - r.weekNumber! + 1) : 1;
    // Store all data fields
    const d = base[wn].data;
    (DEFAULT_PLAN_COLUMNS as ColDef[]).forEach(col => {
      const val = (r as any)[col.key];
      if (val !== undefined && val !== null && val !== '') d[col.key] = val;
    });
    // Also store any extra keys (custom columns)
    const extra = (r as any).extraData;
    let unionesGuardadas: Record<string, number> | null = null;
    if (extra) {
      try {
        const leido = typeof extra === 'string' ? JSON.parse(extra) : extra;
        // `__uniones` no es un dato del plan: es cuántas semanas abarca cada
        // columna. Se saca antes de volcar lo demás para que no aparezca como
        // si fuera una columna más.
        if (leido && typeof leido === 'object') {
          unionesGuardadas = (leido.__uniones as Record<string, number>) ?? null;
          delete leido.__uniones;
          Object.assign(d, leido);
        }
      } catch {}
    }

    /**
     * LA UNIÓN ES POR COLUMNA, Y ASÍ SE DEVUELVE
     *
     * Antes se guardaba UN `endWeekNumber` por fila —el mayor de todas las
     * columnas— y al volver se le aplicaba a las marcadas `mergeable`. Si el
     * profesor unía «Actividad» durante tres semanas, al recargar la unión
     * había saltado a «Tejido temático»; y en una columna suya, añadida por
     * él, se perdía entera.
     */
    if (unionesGuardadas) {
      Object.entries(unionesGuardadas).forEach(([col, semanas]) => {
        const n = Number(semanas);
        if (!Number.isFinite(n) || n < 1) return;
        base[wn].colSpan[col] = n;
        for (let i = wn + 1; i < wn + n && i < base.length; i++) base[i].colSpan[col] = 0;
      });
    } else if (span > 1) {
      // Planes guardados antes de esto: solo se sabe el total de la fila.
      DEFAULT_PLAN_COLUMNS.filter(c => c.mergeable).forEach(col => {
        base[wn].colSpan[col.key] = span;
        for (let i = wn + 1; i < wn + span && i < base.length; i++) base[i].colSpan[col.key] = 0;
      });
    }
  });
  return base;
}

