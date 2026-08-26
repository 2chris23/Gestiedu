// ============================================================
// Columnas del Plan de Evaluación (compartidas)
// Usadas por EvaluationPlanSection (tabla del plan) y por la
// página de Clase en Vivo (card espejo editable del plan).
// ============================================================

export interface PlanColumnDef {
    key: string;
    label: string;
    mergeable: boolean;
    numeric: boolean;
}

export const DEFAULT_PLAN_COLUMNS: PlanColumnDef[] = [
    { key: 'title',          label: 'TEMA GENERADOR',                mergeable: true,  numeric: false },
    { key: 'label',          label: 'TEJIDO TEMÁTICO',               mergeable: true,  numeric: false },
    { key: 'textContent',    label: 'REFERENTES TEÓRICO PRÁCTICOS',  mergeable: false, numeric: false },
    { key: 'actividadEval',  label: 'ACTIVIDAD',                     mergeable: false, numeric: false },
    { key: 'tecnicas',       label: 'TÉCNICAS',                      mergeable: false, numeric: false },
    { key: 'instrumentos',   label: 'INSTRUMENTOS',                  mergeable: false, numeric: false },
    { key: 'criterios',      label: 'CRITERIOS',                     mergeable: false, numeric: false },
    { key: 'tipoEvaluacion', label: 'TIPO DE EVAL.',                 mergeable: false, numeric: false },
    { key: 'ponderacion',    label: 'PONDERACIÓN (%)',               mergeable: false, numeric: true  },
    { key: 'puntos',         label: 'PUNTOS',                        mergeable: false, numeric: true  },
];
