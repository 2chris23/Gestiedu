/**
 * =====================================================
 * CÁLCULO DE PROMEDIO PONDERADO POR CRITERIO (ESCALA 01-20)
 * =====================================================
 *
 * Modelo de negocio venezolano:
 *  - Un plan de evaluación (materia/aula/lapso) se organiza en CRITERIOS.
 *    Cada criterio es una fila/bloque EVALUATION del plan ("Ley de conservación
 *    de la masa" = 4 pts, "Modelos atómicos" = 5 pts, etc.).
 *  - La suma de puntos de TODOS los criterios de un lapso debe ser EXACTAMENTE 20.
 *  - Dentro de cada criterio hay actividades (tareas, exámenes, talleres),
 *    calificadas en escala 0-20. Cada actividad puede tener un peso individual
 *    opcional; si no lo tiene, todas pesan igual dentro del criterio.
 *  - Nota del criterio = (promedio de notas normalizadas de las actividades
 *    CALIFICADAS del criterio ÷ 20) × puntos asignados al criterio.
 *    Las actividades sin calificar se EXCLUYEN del promedio.
 *  - Nota final del lapso = suma de las notas de todos los criterios.
 *
 * Esta función es PURA: no accede a la BD. Recibe estructuras ya armadas y
 * devuelve el resultado. La usan grades.service.ts y cycle-statistics.service.ts.
 */

export interface CriterionActivityGrade {
  /** Nota cruda de la actividad (escala 0-maxScore, normalmente 0-20). */
  score: number;
  /** Escala máxima de la nota (por defecto 20). */
  maxScore?: number;
  /** Peso opcional dentro del criterio (por defecto todas pesan igual). */
  weight?: number;
}

export interface CriterionInput {
  /** Puntos asignados al criterio (0-20, parte de la suma que da 20). */
  puntos: number;
  /** Actividades calificadas (y sin calificar) de este criterio. */
  activities: CriterionActivityGrade[];
}

export interface CriterionResult {
  puntos: number;
  /** Notas normalizadas a escala 0-20 de las actividades CALIFICADAS. */
  normalizedScores: number[];
  /** Promedio de las notas calificadas (0-20). 0 si no hay calificadas. */
  rawAverage: number;
  /** (rawAverage ÷ 20) × puntos — la nota del criterio. */
  note: number;
  /** true si ninguna actividad del criterio está calificada. */
  ungraded: boolean;
}

export interface LapsoAverageResult {
  /** Suma de notas de todos los criterios (0-20). */
  total: number;
  criteria: CriterionResult[];
  /** true si hay actividades planificadas sin calificar (el total NO es definitivo). */
  incomplete: boolean;
  /** Cantidad total de actividades planificadas. */
  plannedActivities: number;
  /** Cantidad de actividades calificadas. */
  gradedActivities: number;
}

/**
 * Normaliza una nota cruda a escala 0-20.
 * Ej. score=15 en maxScore=20 → 15; score=8 en maxScore=10 → 16; se acota a [0,20].
 */
export function normalizeScore(score: number, maxScore: number = 20): number {
  if (maxScore <= 0) return Math.min(20, Math.max(0, score));
  const normalized = (score / maxScore) * 20;
  return Math.round(Math.min(20, Math.max(0, normalized)) * 100) / 100;
}

/**
 * Notas normalizadas de un criterio: excluye actividades sin calificar (null/undefined).
 */
export function normalizedScoresOf(criterion: CriterionInput): number[] {
  return criterion.activities
    .filter(a => a.score !== null && a.score !== undefined && !Number.isNaN(a.score))
    .map(a => normalizeScore(a.score, a.maxScore ?? 20));
}

/**
 * Promedio (posiblemente ponderado) de las notas normalizadas de un criterio.
 * - Si las calificadas tienen pesos (weight>0) y no son todos 1 → promedio ponderado.
 * - Si no → promedio simple.
 */
export function criterionRawAverage(criterion: CriterionInput): number {
  const graded = criterion.activities.filter(a => a.score !== null && a.score !== undefined && !Number.isNaN(a.score));
  if (graded.length === 0) return 0;

  const weights = graded.map(a => a.weight ?? 1);
  const anyWeighted = weights.some(w => w > 0 && w !== 1);

  if (anyWeighted && weights.some(w => w > 0)) {
    const sumW = weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
    const sumNW = graded.reduce((s, a, i) => s + normalizeScore(a.score, a.maxScore ?? 20) * (weights[i] > 0 ? weights[i] : 0), 0);
    return sumW > 0 ? Math.round((sumNW / sumW) * 100) / 100 : 0;
  }

  const ns = graded.map(a => normalizeScore(a.score, a.maxScore ?? 20));
  return Math.round((ns.reduce((s, x) => s + x, 0) / ns.length) * 100) / 100;
}

/**
 * Nota del criterio: (promedio normalizado ÷ 20) × puntos.
 */
export function criterionNote(criterion: CriterionInput): number {
  const avg = criterionRawAverage(criterion);
  return Math.round(((avg / 20) * criterion.puntos) * 100) / 100;
}

/**
 * Cálculo completo del lapso: suma de notas de los criterios (versión 100% pura).
 */
export function calculateLapsoAverage(criteria: CriterionInput[]): LapsoAverageResult {
  const results: CriterionResult[] = criteria.map(c => {
    const ns = normalizedScoresOf(c);
    const avg = criterionRawAverage(c);
    const note = criterionNote(c);
    return {
      puntos: c.puntos,
      normalizedScores: ns,
      rawAverage: avg,
      note,
      ungraded: ns.length === 0,
    };
  });

  const planned = criteria.reduce((s, c) => s + c.activities.length, 0);
  const graded = criteria.reduce((s, c) => s + c.activities.filter(a => a.score !== null && a.score !== undefined && !Number.isNaN(a.score)).length, 0);

  return {
    total: Math.round(results.reduce((s, r) => s + r.note, 0) * 100) / 100,
    criteria: results,
    incomplete: graded < planned,
    plannedActivities: planned,
    gradedActivities: graded,
  };
}
