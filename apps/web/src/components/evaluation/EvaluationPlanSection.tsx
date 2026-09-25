'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { planWeekRangeFromRange } from '@/lib/plan-weeks';
import { toast } from 'sonner';
import {
  Save, Printer, ArrowLeft, Edit2,
  Sparkles, BookOpen, Plus, Trash2, RotateCcw, Zap, ChevronDown, GripVertical, X, Upload, Copy, AlertTriangle
} from 'lucide-react';
import {
  useEvaluationPlanMetadata,
  useUpsertEvaluationPlanMetadata,
  useEvaluationPlanRows,
  useBatchUpsertRows,
  useCopyTargets,
  useCopyPlan,
  type EvaluationPlanRow,
  type EvaluationPlanMetadata,
  type AutoPopulatedData
} from '@/hooks/useEvaluationPlan';
import api from '@/lib/axios';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PLAN_COLUMNS, type PlanColumnDef } from './planColumns';
import PlanPorBloques from './PlanPorBloques';
import CamposDelPlan from './CamposDelPlan';

// ────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────
const LAPSOS = [
  { id: '1', name: '1er Momento', short: 'I' },
  { id: '2', name: '2do Momento', short: 'II' },
  { id: '3', name: '3er Momento', short: 'III' },
];

// ────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────
type ColDef = PlanColumnDef;

// Row stored in state: one entry per week (indexed by weekNumber)
// mergeSpan > 1 means "this cell spans N weeks downward" (rowSpan)
// hiddenByMerge = true means the row above has claimed this cell
interface WeekRow {
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
function getWeekDates(lapsoStart: string | undefined, weekNumber: number): { start: string; end: string } | null {
  if (!lapsoStart) return null;
  const range = planWeekRangeFromRange(new Date(lapsoStart), weekNumber);
  const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return { start: fmt(range.start), end: fmt(range.end) };
}

function buildEmptyWeekRows(totalWeeks: number): WeekRow[] {
  return Array.from({ length: totalWeeks }, (_, i) => ({
    weekNumber: i + 1,
    data: {},
    colSpan: {},
  }));
}

/** Converts flat EvaluationPlanRow[] (from DB) → WeekRow[] */
function dbRowsToWeekRows(dbRows: Partial<EvaluationPlanRow>[], totalWeeks: number): WeekRow[] {
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

/** Converts WeekRow[] → flat rows for DB save */
function weekRowsToDbRows(weeks: WeekRow[], totalWeeks: number): any[] {
  const out: any[] = [];
  weeks.forEach((w, idx) => {
    // find max span for this row (for endWeekNumber)
    const maxSpan = Math.max(1, ...Object.values(w.colSpan).map(Number).filter(Boolean));
    const row: any = {
      id: w.id,
      activityId: w.activityId,
      weekNumber: w.weekNumber,
      endWeekNumber: Math.min(w.weekNumber + maxSpan - 1, totalWeeks),
      rowType: 'EVALUATION',
      orderIndex: idx,
    };
    DEFAULT_PLAN_COLUMNS.forEach(col => {
      // PONDERACIÓN DERIVADA: única fuente de verdad = Puntos (escala 0-20).
      const rawPts = Number(w.data['puntos']);
      const pts = !isNaN(rawPts) && rawPts > 0 ? Math.round(rawPts * 100) / 100 : (col.numeric && col.key === 'puntos' ? 0 : null);
      if (col.key === 'puntos') {
        row['puntos'] = pts ?? 0;
      } else if (col.key === 'ponderacion') {
        row['ponderacion'] = pts ? Math.round((pts / 20) * 100 * 100) / 100 : 0;
      } else {
        row[col.key] = w.data[col.key] ?? (col.numeric ? 0 : '');
      }
    });
    // Store extra cols as extraData JSON
    const extraKeys = Object.keys(w.data).filter(k => !DEFAULT_PLAN_COLUMNS.find(c => c.key === k));
    const extraData: any = {};
    extraKeys.forEach(k => { extraData[k] = w.data[k]; });

    // Y cuántas semanas abarca CADA columna, que es lo que el `endWeekNumber`
    // de la fila no sabe contar.
    const uniones: Record<string, number> = {};
    Object.entries(w.colSpan).forEach(([col, n]) => {
      if (Number(n) > 1) uniones[col] = Number(n);
    });
    if (Object.keys(uniones).length > 0) extraData.__uniones = uniones;

    if (Object.keys(extraData).length > 0) {
      row.extraData = JSON.stringify(extraData);
    }
    out.push(row);
  });
  return out;
}

// ────────────────────────────────────────────────
// SUBCOMPONENT: Expand Handle
// ────────────────────────────────────────────────
function ExpandHandle({ onExpand, onCollapse, canCollapse }: {
  onExpand: () => void;
  onCollapse: () => void;
  canCollapse: boolean;
}) {
  return (
    <div className="absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 pb-0.5 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
      <button
        title="Expandir hacia abajo (abarcar semana siguiente)"
        onClick={onExpand}
        className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-sm px-1 py-0.5 text-[9px] flex items-center gap-0.5 shadow-md transition-colors"
      >
        <ChevronDown className="w-2.5 h-2.5" />↓
      </button>
      {canCollapse && (
        <button
          title="Reducir (quitar una semana)"
          onClick={onCollapse}
          className="bg-red-400 hover:bg-red-500 text-white rounded-sm px-1 py-0.5 text-[9px] shadow-md transition-colors"
        >✕</button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// SUBCOMPONENT: AutoResizeTextarea
// ────────────────────────────────────────────────
function AutoResizeTextarea({
  value,
  onChange,
  minHeight = 22,
  placeholder,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  minHeight?: number;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.max(minHeight, ref.current.scrollHeight) + 'px';
    }
  }, [minHeight]);

  useEffect(() => {
    resize();
  }, [value, minHeight, resize]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onInput={resize}
      placeholder={placeholder}
      className={`${className || ''} resize-none overflow-hidden break-words`}
      rows={1}
      style={{ minHeight: `${minHeight}px` }}
    />
  );
}

// ────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────
export default function EvaluationPlanSection({
  classroomId, subjectId, lapso = '1', canEdit
}: {
  classroomId: string;
  subjectId: string;
  lapso?: string;
  canEdit?: boolean;
}) {
  const selectedLapso = lapso;

  // ── Server data ──────────────────────────────
  const { data: metaData, isLoading: isLoadingMeta } = useEvaluationPlanMetadata({ classroomId, subjectId, lapso });
  const { data: rowsData, isLoading: isLoadingRows } = useEvaluationPlanRows({ classroomId, subjectId, lapso });
  const { mutateAsync: saveMeta, isPending: isSavingMeta } = useUpsertEvaluationPlanMetadata();
  const { mutateAsync: saveRows, isPending: isSavingRows } = useBatchUpsertRows();
  const queryClient = useQueryClient();

  // ── Local state ──────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  /**
   * La versión del plan que se tenía delante al empezar a editar, y cómo
   * estaba todo en ese momento (para saber si hay cambios sin guardar).
   */
  const versionAlEditar = useRef<string | undefined>(undefined);
  const comoEstabaAlEditar = useRef<string>('');
  /** Alguien guardó este plan desde otro sitio mientras se editaba aquí. */
  const [choque, setChoque] = useState<string | null>(null);
  const [localMeta, setLocalMeta] = useState<Partial<EvaluationPlanMetadata>>({});
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [columns, setColumns] = useState<ColDef[]>([...DEFAULT_PLAN_COLUMNS]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // ── Copiar el plan a otras secciones ─────────
  const [copiandoAbierto, setCopiandoAbierto] = useState(false);
  const [destinosElegidos, setDestinosElegidos] = useState<string[]>([]);
  const { data: destinos = [], isLoading: cargandoDestinos } = useCopyTargets({
    sourceClassroomId: classroomId,
    subjectId,
    enabled: copiandoAbierto,
  });
  const { mutateAsync: copiarPlan, isPending: copiando } = useCopyPlan();

  const alternarDestino = (id: string) =>
    setDestinosElegidos(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const cerrarCopiar = () => {
    setCopiandoAbierto(false);
    setDestinosElegidos([]);
  };

  const confirmarCopia = async () => {
    if (destinosElegidos.length === 0) return;
    try {
      await copiarPlan({
        sourceClassroomId: classroomId,
        sourceSubjectId: subjectId,
        sourceLapso: selectedLapso,
        targetClassroomIds: destinosElegidos,
      });
      toast.success(
        destinosElegidos.length === 1
          ? 'Plan copiado a 1 sección'
          : `Plan copiado a ${destinosElegidos.length} secciones`
      );
      cerrarCopiar();
    } catch (error: any) {
      // El servidor dice el motivo exacto (p.ej. una sección que no es suya):
      // se muestra tal cual en vez de un "ocurrió un error".
      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'No se pudo copiar el plan');
    }
  };

  const handleImportWord = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/evaluation-plan/parse-word', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data?.success && response.data?.rows) {
        const parsedRows: Record<string, string>[] = response.data.rows;
        
        const newWeeks = [...weeks];
        parsedRows.forEach((r, i) => {
          if (i < newWeeks.length) {
            // Sincronizar puntos y ponderación si vienen del Word
            if (r['ponderacion'] && !r['puntos']) {
              const p = parseFloat(String(r['ponderacion']).replace('%', '').trim());
              if (!isNaN(p)) {
                const pt = Math.round((p / 100) * 20 * 100) / 100;
                r['puntos'] = String(pt);
                r['ponderacion'] = String(Math.round((pt / 20) * 100 * 100) / 100);
              }
            } else if (r['puntos']) {
              const pt = parseFloat(String(r['puntos']).trim());
              if (!isNaN(pt)) {
                r['puntos'] = String(Math.round(pt * 100) / 100);
                r['ponderacion'] = String(Math.round((pt / 20) * 100 * 100) / 100);
              }
            }
            newWeeks[i].data = { ...newWeeks[i].data, ...r };
            Object.keys(r).forEach(k => {
              newWeeks[i].colSpan[k] = 1;
            });
          }
        });
        setWeeks(newWeeks);
        toast.success('Datos importados correctamente desde Word.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Error al importar el documento. Asegúrate de que tenga una tabla válida.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Derived ──────────────────────────────────
  const autoPopulated: AutoPopulatedData = metaData?.autoPopulated || {};
  const totalWeeks = autoPopulated.lapsoWeeks || localMeta.totalSemanas || 24;

  // ── Sync from server ─────────────────────────
  // MIENTRAS SE EDITA, LO DE LA PANTALLA NO SE TOCA.
  // Estas dos sincronizaciones copiaban lo del servidor encima de lo que el
  // profesor estaba escribiendo cada vez que llegaba una lectura nueva —y
  // llega una tras CUALQUIER guardado de cualquier pantalla, y con cada aviso
  // de tiempo real—. Veinte minutos de trabajo podían desaparecer sin que él
  // hiciera nada. Al salir del editor, sí se vuelve a lo guardado.
  useEffect(() => {
    if (isEditing) return;
    if (metaData?.metadata) {
      setLocalMeta(metaData.metadata);
      // restore custom columns if saved
      if (metaData.metadata.customColumns) {
        try {
          const parsed: ColDef[] = JSON.parse(metaData.metadata.customColumns);
          if (Array.isArray(parsed) && parsed.length > 0) setColumns(parsed);
        } catch {}
      }
    } else {
      setLocalMeta({});
      setColumns([...DEFAULT_PLAN_COLUMNS]);
    }
  }, [metaData, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    const tw = autoPopulated.lapsoWeeks || localMeta.totalSemanas || 24;
    if (rowsData?.rows && rowsData.rows.length > 0) {
      setWeeks(dbRowsToWeekRows(rowsData.rows, tw));
    } else {
      setWeeks(buildEmptyWeekRows(tw));
    }
  }, [rowsData, autoPopulated.lapsoWeeks, localMeta.totalSemanas, isEditing]);

  // ── Totals ────────────────────────────────────
  const totalPuntos = useMemo(() =>
    Math.round(weeks.reduce((s, w) => s + (Number(w.data['puntos']) || 0), 0) * 100) / 100
  , [weeks]);

  const totalPonderacion = useMemo(() =>
    Math.round((totalPuntos / 20) * 100 * 100) / 100
  , [totalPuntos]);

  // ── Helpers: column mutations ─────────────────
  const addColumn = () => {
    const key = `custom_${Date.now()}`;
    setColumns(prev => [...prev, { key, label: 'Nueva Columna', mergeable: false, numeric: false }]);
  };

  const removeColumn = (key: string) => {
    setColumns(prev => prev.filter(c => c.key !== key));
  };

  const renameColumn = (key: string, label: string) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, label } : c));
  };

  const resetColumns = () => {
    setColumns([...DEFAULT_PLAN_COLUMNS]);
  };

  /**
   * SI UN CAMPO ABARCA VARIAS SEMANAS O ES DE CADA SEMANA
   *
   * Venía fijo en el código para dos columnas concretas —tema generador y
   * tejido temático—, así que una columna añadida por el profesor no podía
   * abarcar nunca, y las dos de fábrica no podían dejar de hacerlo. Es una
   * decisión suya, no nuestra.
   */
  const cambiarSiAbarca = (key: string, abarca: boolean) => {
    setColumns(prev => prev.map(c => (c.key === key ? { ...c, mergeable: abarca } : c)));
    if (!abarca) {
      // Deja de abarcar: se sueltan las semanas que tenía cogidas, o
      // quedarían escondidas sin nada que las enseñe.
      setWeeks(prev =>
        prev.map(w => {
          const colSpan = { ...w.colSpan };
          delete colSpan[key];
          return { ...w, colSpan };
        })
      );
    }
  };

  // ── Helpers: cell mutation ────────────────────
  const setCell = useCallback((weekIdx: number, colKey: string, value: string | number) => {
    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      next[weekIdx].data[colKey] = value;
      if (colKey === 'puntos') {
        const pts = Number(value);
        if (!isNaN(pts) && pts > 0) {
          next[weekIdx].data['ponderacion'] = Math.round((pts / 20) * 100 * 100) / 100;
        } else {
          next[weekIdx].data['ponderacion'] = 0;
        }
      }
      return next;
    });
  }, []);

  /** Expand a cell span downward by 1 for a given col */
  const expandCell = useCallback((weekIdx: number, colKey: string) => {
    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      const currentSpan = next[weekIdx].colSpan[colKey] || 1;
      const newSpan = Math.min(currentSpan + 1, totalWeeks - weekIdx);
      next[weekIdx].colSpan[colKey] = newSpan;
      // Clear data in absorbed rows so they know they are merged
      for (let i = weekIdx + 1; i < weekIdx + newSpan && i < next.length; i++) {
        delete next[i].data[colKey];
        next[i].colSpan[colKey] = 0; // 0 = hidden (absorbed)
      }
      return next;
    });
  }, [totalWeeks]);

  /** Collapse a cell span by 1 */
  const collapseCell = useCallback((weekIdx: number, colKey: string) => {
    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      const currentSpan = next[weekIdx].colSpan[colKey] || 1;
      if (currentSpan <= 1) return next;
      const newSpan = currentSpan - 1;
      // Re-enable the last absorbed row
      const lastAbsorbed = weekIdx + currentSpan - 1;
      if (lastAbsorbed < next.length) {
        next[lastAbsorbed].colSpan[colKey] = 1;
      }
      next[weekIdx].colSpan[colKey] = newSpan;
      return next;
    });
  }, []);

  /**
   * ALARGAR O ACORTAR UN BLOQUE
   *
   * En la tabla, unir celdas se hace columna a columna con un botón que sale
   * al pasar el cursor. De pie no hay cursor y no hay tabla: hay bloques, y un
   * bloque se alarga entero. Se aplica a las columnas que abarcan semanas
   * —las `mergeable`—, que es lo mismo que se guarda.
   */
  const alargarBloque = useCallback((indice: number) => {
    columns.filter(c => c.mergeable).forEach(col => expandCell(indice, col.key));
  }, [columns, expandCell]);

  const acortarBloque = useCallback((indice: number) => {
    columns.filter(c => c.mergeable).forEach(col => collapseCell(indice, col.key));
  }, [columns, collapseCell]);

  const fechasDeLaSemana = useCallback(
    (numero: number) => getWeekDates(autoPopulated?.lapsoStartDate, numero),
    [autoPopulated?.lapsoStartDate]
  );

  // ── Auto-distribute ───────────────────────────
  const distributeEqually = () => {
    const activeIdxs = weeks
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => {
        const hasActivity = columns.some(c => !c.numeric && w.data[c.key] && String(w.data[c.key]).trim());
        return hasActivity;
      })
      .map(({ i }) => i);

    if (activeIdxs.length === 0) return;

    const count = activeIdxs.length;
    const ptPerItem = Math.floor((20 / count) * 100) / 100;

    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      let accumulatedPt = 0;

      activeIdxs.forEach((idx, i) => {
        const isLast = i === count - 1;
        const currentPt = isLast ? Math.round((20 - accumulatedPt) * 100) / 100 : ptPerItem;
        accumulatedPt = Math.round((accumulatedPt + currentPt) * 100) / 100;
        const currentPond = Math.round((currentPt / 20) * 100 * 100) / 100;

        next[idx].data['puntos'] = currentPt;
        next[idx].data['ponderacion'] = currentPond;
      });
      return next;
    });
  };

  // ── Save ──────────────────────────────────────
  const fotoDelEditor = () =>
    JSON.stringify([weekRowsToDbRows(weeks, totalWeeks), columns, localMeta]);

  const empezarAEditar = () => {
    versionAlEditar.current = rowsData?.version;
    comoEstabaAlEditar.current = fotoDelEditor();
    setChoque(null);
    setIsEditing(true);
  };

  const salirDelEditor = () => {
    if (fotoDelEditor() !== comoEstabaAlEditar.current &&
        !window.confirm('Tienes cambios sin guardar en el plan. ¿Salir y perderlos?')) {
      return;
    }
    setChoque(null);
    setIsEditing(false);
  };

  /** Tras un choque: se deja lo de aquí y se carga lo que se guardó en el otro sitio. */
  const cargarLoGuardado = async () => {
    setChoque(null);
    setIsEditing(false);
    await queryClient.invalidateQueries({ queryKey: ['evaluationPlanRows'] });
    await queryClient.invalidateQueries({ queryKey: ['evaluationPlanMetadata'] });
  };

  const handleSave = async () => {
    try {
      // Primero las filas: son el trabajo del profesor, y es donde se
      // comprueba que nadie guardó entretanto. Si choca, no se guarda nada.
      const dbRows = weekRowsToDbRows(weeks, totalWeeks);
      const guardado = await saveRows({ classroomId, subjectId, lapso, rows: dbRows, version: versionAlEditar.current });
      versionAlEditar.current = guardado?.version;
      await saveMeta({
        classroomId, subjectId, lapso,
        ...localMeta,
        customColumns: JSON.stringify(columns),
      });
      setChoque(null);
      setIsEditing(false);
      toast.success('Plan de evaluación guardado');
    } catch (error: any) {
      const datos = error?.response?.data;
      if (error?.response?.status === 409) {
        setChoque(datos?.error || 'Este plan se guardó desde otro sitio mientras lo editabas.');
        return;
      }
      // El motivo exacto (p. ej. «la suma de puntos es 18 y debe ser 20») es
      // lo que el profesor necesita para arreglarlo: se enseña tal cual.
      toast.error(datos?.error || datos?.message || 'No se pudo guardar el plan de evaluación. Tus cambios siguen en pantalla.');
    }
  };

  const handleMetaChange = (field: string, value: any) => {
    setLocalMeta(prev => ({ ...prev, [field]: value }));
  };

  // ────────────────────────────────────────────────
  // RENDER: Membrete
  // ────────────────────────────────────────────────
  const renderMembrete = (mode: 'view' | 'edit') => {
    const fields = [
      { key: 'peic',               label: 'P.E.I.C.' },
      { key: 'enfasisCurricular',  label: 'ÉNFASIS CURRICULAR' },
      { key: 'referentesEticos',   label: 'REFERENTES ÉTICOS' },
      { key: 'intencionalidad',    label: 'INTENCIONALIDAD' },
      { key: 'temaIndispensable',  label: 'TEMA INDISPENSABLE' },
    ];
    return (
      <div className="bg-white border-b border-gray-200">
        <div className="p-4 pb-2 text-center">
          <div className="text-[10px] font-bold uppercase text-gray-800 leading-tight">
            República Bolivariana de Venezuela<br />
            Ministerio del Poder Popular para la Educación<br />
            <span className="text-sm text-indigo-900 mt-1 block">
              {autoPopulated.instituteName || 'INSTITUCIÓN EDUCATIVA'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-0 border-t border-gray-200 bg-gray-50 text-[10px]">
          {[
            ['Docente', autoPopulated.teacherName || 'Sin asignar'],
            ['Área de Formación', autoPopulated.subjectName || '—'],
            ['Año / Sección', `${autoPopulated.classroomGrade ? autoPopulated.classroomGrade + '°' : ''} ${autoPopulated.classroomSection ? '"' + autoPopulated.classroomSection + '"' : '—'}`],
            ['Momento Pedagógico', `${LAPSOS.find(l => l.id === selectedLapso)?.name} — ${autoPopulated.academicYearName || ''}`],
          ].map(([label, val]) => (
            <div key={label} className="p-2 border-r border-b border-gray-200 last:border-r-0">
              <span className="text-gray-400 font-bold uppercase block mb-0.5">{label}</span>
              <span className="font-semibold text-gray-800">{val}</span>
            </div>
          ))}
        </div>

        {/* Separador elegante para que las divisiones de 4 columnas no choquen visualmente con las de 5 */}
        <div className="bg-slate-100 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600 border-b border-gray-200 flex items-center justify-between">
          <span>Referentes Curriculares e Institucionales</span>
        </div>

        <div className="grid grid-cols-5 gap-0 bg-white text-[10px]">
          {fields.map(field => (
            <div key={field.key} className="p-2 border-r border-gray-200 last:border-r-0">
              <span className="text-gray-400 font-bold uppercase block mb-1">{field.label}</span>
              {mode === 'edit' ? (
                <textarea
                  value={(localMeta as any)[field.key] || ''}
                  onChange={e => handleMetaChange(field.key, e.target.value)}
                  placeholder={`Escriba ${field.label.toLowerCase()}...`}
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-200 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-[10px]"
                />
              ) : (
                <span className="text-gray-700 leading-snug font-medium block">{(localMeta as any)[field.key] || '—'}</span>
              )}
            </div>
          ))}
        </div>

        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white text-center py-2 font-bold text-sm uppercase tracking-wider">
          <Sparkles className="w-4 h-4 inline-block mr-2 opacity-60" />
          Plan de Evaluación — {LAPSOS.find(l => l.id === selectedLapso)?.name}
          <span className="ml-3 text-[10px] font-normal opacity-60">({totalWeeks} semanas)</span>
        </div>
      </div>
    );
  };

  // ────────────────────────────────────────────────
  // RENDER: Table (VIEW mode) — with real rowSpan
  // ────────────────────────────────────────────────
  const renderViewTable = () => {
    // Precompute which cells are hidden (absorbed by a rowspan above)
    const hidden: Record<string, Set<number>> = {}; // colKey → set of weekIdxs hidden
    const rowSpanMap: Record<string, Map<number, number>> = {}; // colKey → weekIdx → span
    columns.forEach(col => {
      hidden[col.key] = new Set();
      rowSpanMap[col.key] = new Map();
    });

    weeks.forEach((w, idx) => {
      columns.forEach(col => {
        if (hidden[col.key].has(idx)) return;
        const span = w.colSpan[col.key] || 1;
        rowSpanMap[col.key].set(idx, span);
        const limit = Math.min(idx + span, weeks.length);
        for (let i = idx + 1; i < limit; i++) {
          hidden[col.key].add(i);
        }
      });
    });

    const nonNumericCols = columns.filter(c => !c.numeric);

    return (
      <div className="flex flex-col h-full">
        {/* Tabla unificada con thead y tfoot sticky para sincronización y alineación perfecta de columnas */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-[10px] text-left text-gray-700 border-collapse">
            <thead className="text-white uppercase bg-slate-800 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-1.5 py-2.5 border border-slate-700 text-center w-20 min-w-[76px] bg-slate-800 sticky top-0 font-bold whitespace-nowrap">
                  FECHA / SEMANA
                </th>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`px-1.5 py-2.5 border border-slate-700 bg-slate-800 sticky top-0 font-bold ${
                      col.numeric ? 'text-center whitespace-nowrap' : 'text-left'
                    }`}
                    style={{
                      width: col.numeric ? (col.key === 'puntos' ? '54px' : '64px') : undefined,
                      minWidth: col.numeric ? (col.key === 'puntos' ? '50px' : '60px') : '70px',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {weeks.map((w, idx) => (
                <tr key={w.weekNumber} className="border-b border-gray-200 hover:bg-slate-50/50 transition-colors">
                  <td className="px-1.5 py-2 border border-gray-200 text-center align-middle w-20 min-w-[76px] bg-slate-50/40">
                    <div className="font-bold text-gray-800 text-[10px] uppercase">Semana {w.weekNumber}</div>
                    <div className="text-[9px] text-gray-500 mt-0.5 leading-tight">
                      {getWeekDates(autoPopulated?.lapsoStartDate, w.weekNumber)?.start}
                      <br /><span className="text-gray-400">al</span><br />
                      {getWeekDates(autoPopulated?.lapsoStartDate, w.weekNumber)?.end}
                    </div>
                  </td>
                  {columns.map(col => {
                    if (hidden[col.key].has(idx)) return null;
                    const span = rowSpanMap[col.key].get(idx) || 1;
                    const val = w.data[col.key];
                    return (
                      <td
                        key={col.key}
                        rowSpan={span}
                        className={`px-1.5 py-2 border border-gray-200 align-middle ${
                          col.numeric ? 'text-center' : 'text-left'
                        }`}
                      >
                        <div
                          className={`whitespace-pre-wrap ${
                            col.numeric
                              ? 'text-center font-bold text-gray-900'
                              : 'text-left font-medium text-gray-700'
                          }`}
                        >
                          {col.key === 'ponderacion' && val ? `${val}%` :
                           col.key === 'puntos' && val ? `${val} pts` :
                           val || ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-300 font-bold text-gray-800 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
              <tr>
                <td
                  colSpan={nonNumericCols.length + 1}
                  className="px-4 py-2.5 border border-gray-300 text-right uppercase text-[10px] tracking-wider text-gray-700 bg-slate-100 sticky bottom-0"
                >
                  Total Ponderación Acumulada
                </td>
                <td className="px-1.5 py-2.5 border border-gray-300 text-center font-black text-xs bg-slate-100 sticky bottom-0">
                  <span className={totalPonderacion > 100 ? 'text-red-600' : totalPonderacion === 100 ? 'text-emerald-600' : 'text-amber-600'}>
                    {totalPonderacion}%
                  </span>
                  {totalPonderacion < 100 && (
                    <span className="block text-[8px] font-normal text-gray-400">faltan {100 - totalPonderacion}%</span>
                  )}
                  {totalPonderacion > 100 && (
                    <span className="block text-[8px] font-normal text-red-500">exceso {totalPonderacion - 100}%</span>
                  )}
                </td>
                <td className="px-1.5 py-2.5 border border-gray-300 text-center font-black text-xs text-gray-800 bg-slate-100 sticky bottom-0">
                  {totalPuntos} pts
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer: Observaciones */}
        <div className="px-4 py-2 bg-white border-t border-gray-200 flex-shrink-0">
          <span className="text-[10px] font-bold uppercase text-gray-500">Observaciones:</span>
          <p className="text-xs mt-0.5 text-gray-700">{localMeta.observaciones || 'Sin observaciones.'}</p>
        </div>
      </div>
    );
  };

  // ────────────────────────────────────────────────
  // RENDER: Table (EDIT mode)
  // ────────────────────────────────────────────────
  const renderEditTable = () => {
    const hiddenEdit: Record<string, Set<number>> = {};
    const spanMapEdit: Record<string, Map<number, number>> = {};
    columns.forEach(col => {
      hiddenEdit[col.key] = new Set();
      spanMapEdit[col.key] = new Map();
    });
    weeks.forEach((w, idx) => {
      columns.forEach(col => {
        if (hiddenEdit[col.key].has(idx)) return;
        const span = w.colSpan[col.key] || 1;
        spanMapEdit[col.key].set(idx, span);
        const limit = Math.min(idx + span, weeks.length);
        for (let i = idx + 1; i < limit; i++) {
          hiddenEdit[col.key].add(i);
        }
      });
    });

    const nonNumericCols = columns.filter(c => !c.numeric);

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Tabla unificada editable con thead y tfoot sticky */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-[10px] text-left text-gray-700 border-collapse">
            <thead className="text-white uppercase bg-slate-800 sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-1 py-1.5 border border-slate-700 text-center w-18 min-w-[70px] bg-slate-800 sticky top-0 font-bold whitespace-nowrap">
                  FECHA/SEM.
                </th>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="px-1 py-1.5 border border-slate-700 bg-slate-800 sticky top-0"
                    style={{
                      width: col.numeric ? (col.key === 'puntos' ? '54px' : '64px') : undefined,
                      minWidth: col.numeric ? (col.key === 'puntos' ? '50px' : '60px') : '70px',
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <AutoResizeTextarea
                        value={col.label}
                        onChange={e => renameColumn(col.key, e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-white w-full focus:outline-none focus:ring-1 focus:ring-indigo-400 text-[10px] min-w-0 text-center leading-tight font-bold"
                        minHeight={20}
                      />
                      {!DEFAULT_PLAN_COLUMNS.find(d => d.key === col.key) && (
                        <button
                          onClick={() => removeColumn(col.key)}
                          className="text-red-300 hover:text-red-100 shrink-0 p-0.5 rounded hover:bg-slate-600"
                          title="Eliminar columna"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-1 py-1.5 border border-slate-700 w-8 text-center bg-slate-800 sticky top-0">
                  <button onClick={addColumn} title="Agregar columna" className="bg-indigo-500 hover:bg-indigo-400 text-white rounded p-0.5 transition-colors">
                    <Plus className="w-3 h-3 mx-auto" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {weeks.map((w, idx) => {
                return (
                  <tr key={w.weekNumber} className="bg-white border-b border-gray-200 hover:bg-indigo-50/20 transition-colors">
                    <td className="px-1 py-1 border border-gray-200 text-center align-middle w-20 bg-slate-50">
                      <div className="font-bold text-gray-800 text-[10px] uppercase">S.{w.weekNumber}</div>
                      <div className="text-[8px] text-gray-400 leading-tight">
                        {getWeekDates(autoPopulated?.lapsoStartDate, w.weekNumber)?.start} - {getWeekDates(autoPopulated?.lapsoStartDate, w.weekNumber)?.end}
                      </div>
                    </td>

                    {columns.map(col => {
                      if (hiddenEdit[col.key].has(idx)) return null;
                      const span = spanMapEdit[col.key].get(idx) || 1;
                      const canExpand = idx + span < weeks.length;
                      const canCollapse = span > 1;

                      return (
                        <td key={col.key} rowSpan={span} className="px-0.5 py-0.5 border border-gray-200 align-top relative group">
                          {col.numeric ? (
                            col.key === 'ponderacion' ? (
                              <input
                                type="text"
                                readOnly
                                value={(() => {
                                  const pts = Number(w.data['puntos']);
                                  if (isNaN(pts) || pts <= 0) return '';
                                  const pond = Math.round((pts / 20) * 100 * 100) / 100;
                                  return `${pond}%`;
                                })()}
                                className="w-full px-1 py-0.5 h-full min-h-[22px] border-none bg-gray-100 text-gray-600 text-[10px] cursor-not-allowed font-medium text-center"
                                title="La ponderación se deriva de los Puntos (puntos/20×100). Edita Puntos."
                                placeholder="0%"
                              />
                            ) : (
                              <input
                                type="number"
                                step="any"
                                value={w.data[col.key] !== undefined && w.data[col.key] !== null && w.data[col.key] !== '' ? String(w.data[col.key]) : ''}
                                onChange={e => {
                                  const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                  setCell(idx, col.key, isNaN(val as number) ? '' : (val as number));
                                }}
                                className="w-full px-1 py-0.5 h-full min-h-[22px] border-none focus:ring-1 focus:ring-indigo-500 outline-none bg-transparent text-[10px] text-center"
                                placeholder="0"
                              />
                            )
                          ) : (
                            <AutoResizeTextarea
                              value={String(w.data[col.key] ?? '')}
                              onChange={e => setCell(idx, col.key, e.target.value)}
                              className="w-full px-1 py-0.5 h-full border-none focus:ring-1 focus:ring-indigo-500 outline-none bg-transparent text-[10px]"
                              minHeight={Math.max(22, span * 28)}
                              placeholder={`${col.label}...`}
                            />
                          )}
                          {!col.numeric && (
                            <ExpandHandle onExpand={() => expandCell(idx, col.key)} onCollapse={() => collapseCell(idx, col.key)} canCollapse={canCollapse} />
                          )}
                          {span > 1 && (
                            <div className="absolute top-0 right-0 bg-indigo-100 text-indigo-700 text-[7px] rounded-bl px-1 font-bold pointer-events-none">
                              {span}s
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-0.5 py-0.5 border border-gray-200 bg-slate-50/50 w-8" />
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-slate-100 border-t-2 border-slate-300 font-bold text-gray-800 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
              <tr>
                <td
                  colSpan={nonNumericCols.length + 1}
                  className="px-4 py-2 border border-gray-300 text-right uppercase text-[10px] tracking-wider text-gray-700 bg-slate-100 sticky bottom-0"
                >
                  Total Ponderación
                </td>
                <td className="px-1 py-2 border border-gray-300 text-center font-black text-xs bg-slate-100 sticky bottom-0">
                  <span className={totalPonderacion > 100 ? 'text-red-600' : totalPonderacion === 100 ? 'text-emerald-600' : 'text-amber-600'}>
                    {totalPonderacion}%
                  </span>
                </td>
                <td className="px-1 py-2 border border-gray-300 text-center font-black text-xs text-gray-800 bg-slate-100 sticky bottom-0">
                  {totalPuntos} pts
                </td>
                <td className="border border-gray-300 bg-slate-100 sticky bottom-0" />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer: Observaciones editables */}
        <div className="px-4 py-2 bg-white border-t border-gray-200 flex-shrink-0">
          <span className="text-[10px] font-bold uppercase text-gray-500">Observaciones:</span>
          <textarea
            value={localMeta.observaciones || ''}
            onChange={e => handleMetaChange('observaciones', e.target.value)}
            placeholder="Observaciones finales..."
            rows={2}
            className="w-full mt-1 text-xs border border-gray-200 bg-gray-50 rounded p-2 focus:ring-indigo-500 outline-none resize-none"
          />
        </div>
      </div>
    );
  };

  // ────────────────────────────────────────────────
  // LOADING
  // ────────────────────────────────────────────────
  if (isLoadingMeta || isLoadingRows) {
    return (
      <div className="h-64 flex items-center justify-center bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // ────────────────────────────────────────────────
  // EDIT FULL-SCREEN MODE
  // ────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#f3f4f6] flex flex-col overflow-hidden">
        {/* TOP BAR */}
        <div className="bg-white border-b border-gray-200 shadow-sm h-16 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={salirDelEditor} aria-label="Salir del editor" className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Editor Inmersivo — Plan de Evaluación</h2>
              <p className="text-xs text-indigo-600 font-medium">Modo Edición Avanzada · {LAPSOS.find(l => l.id === lapso)?.name} · {totalWeeks} semanas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".docx"
              ref={fileInputRef}
              onChange={handleImportWord}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              title="Importar un archivo Word (.docx) con una tabla de evaluación"
              className="flex items-center px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-xs font-bold disabled:opacity-50"
            >
              <Upload className="w-4 h-4 mr-1.5" /> {isImporting ? 'Importando...' : 'Importar Word'}
            </button>
            <button
              onClick={distributeEqually}
              title="Distribuir ponderación y puntos equitativamente entre semanas con actividad"
              className="flex items-center px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors text-xs font-bold"
            >
              <Zap className="w-4 h-4 mr-1.5" /> Distribuir Equitativamente
            </button>
            <button
              onClick={resetColumns}
              title="Restaurar columnas predeterminadas del Ministerio"
              className="flex items-center px-3 py-2 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-xs font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restaurar Columnas
            </button>
            <button
              onClick={handleSave}
              disabled={isSavingMeta || isSavingRows}
              className="flex items-center px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-bold shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" /> {isSavingRows ? 'Guardando...' : 'Guardar y Cerrar'}
            </button>
          </div>
        </div>

        {choque && (
          <div role="alert" className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-wrap items-center gap-3 text-sm text-amber-900 shrink-0">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
            <span className="flex-1 min-w-[16rem]">{choque}</span>
            <button
              onClick={cargarLoGuardado}
              className="px-3 py-2 min-h-[44px] rounded-lg border border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-100"
            >
              Descartar mis cambios y cargar lo guardado
            </button>
          </div>
        )}

        {/* HINT BAR */}
        <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-2 flex items-center gap-3 text-xs text-indigo-700 shrink-0">
          <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
          <span>
            <strong>Tip:</strong> Cada fila es una semana del lapso. Para que un tema abarque varias semanas,
            escríbelo y usa el botón <strong>↓</strong> de la celda (en un teléfono, los botones <strong>+</strong> y
            <strong>−</strong> de la cabecera del bloque). Añade o elimina columnas desde la cabecera de la tabla (➕ / ✕).
          </span>
        </div>

        {/* CANVAS */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-4">
            <div className="space-y-3 min-[700px]:hidden">
              {/* Añadir, renombrar y quitar campos: en la tabla eso son dos
                  iconos de 16 px en una cabecera de mil píxeles de ancho, o
                  sea, fuera de la pantalla de cualquier teléfono. */}
              <CamposDelPlan
                columnas={columns}
                alRenombrar={renameColumn}
                alQuitar={removeColumn}
                alAnadir={addColumn}
                alCambiarSiAbarca={cambiarSiAbarca}
                alRestaurar={resetColumns}
              />

              <PlanPorBloques
                semanas={weeks}
                columnas={columns}
                fechasDe={fechasDeLaSemana}
                puedeEditar
                alEscribir={(indice, columna, valor) => setCell(indice, columna, valor)}
                alAlargar={alargarBloque}
                alAcortar={acortarBloque}
              />
            </div>

            <div className="rejilla-densa hidden rounded-xl overflow-hidden shadow-xl border border-gray-300 min-[700px]:block">
              {renderMembrete('edit')}
              {renderEditTable()}
            </div>
            <div className="h-20" />
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────
  // VIEW MODE
  // ────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 240px)', minHeight: 400 }}>
      {/* Top bar */}
      <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl shadow-sm border border-gray-100 print:hidden mb-3 shrink-0">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" /> Plan de Evaluación
            <span className="text-xs font-normal text-gray-400 ml-1">— {LAPSOS.find(l => l.id === selectedLapso)?.name}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center px-3 py-1.5 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-xs">
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir
          </button>
          {canEdit && (
            <button
              onClick={() => setCopiandoAbierto(true)}
              className="flex items-center px-3 py-1.5 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-xs"
              title="Usar este mismo plan en otra sección donde das esta materia"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar a otra sección
            </button>
          )}
          {canEdit && (
            <button onClick={empezarAEditar} className="flex items-center px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-bold text-xs">
              <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Editar Plan
            </button>
          )}
        </div>
      </div>

      {/* ── Copiar el plan a otras secciones ───────────────────────── */}
      {copiandoAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Copy className="w-4 h-4 text-indigo-600" /> Copiar plan a otra sección
              </h3>
              <button onClick={cerrarCopiar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 max-h-[50vh] overflow-auto">
              <p className="text-xs text-gray-500 mb-3">
                Se copia el plan del <strong>{LAPSOS.find(l => l.id === selectedLapso)?.name}</strong> tal como está ahora.
              </p>

              {cargandoDestinos ? (
                <p className="text-xs text-gray-400 py-4 text-center">Buscando tus secciones...</p>
              ) : destinos.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">
                  No hay otra sección donde des esta materia en este año escolar.
                </p>
              ) : (
                <div className="space-y-1">
                  {destinos.map(seccion => (
                    <label
                      key={seccion.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={destinosElegidos.includes(seccion.id)}
                        onChange={() => alternarDestino(seccion.id)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-800">
                        {seccion.grade}° {seccion.section}
                        <span className="text-xs text-gray-400 ml-2">{seccion.name}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {destinosElegidos.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    El plan que tengan esas secciones en este lapso se reemplaza por este.
                    Las notas ya puestas no se tocan.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <button
                onClick={cerrarCopiar}
                className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCopia}
                disabled={destinosElegidos.length === 0 || copiando}
                className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copiando ? 'Copiando...' : `Copiar${destinosElegidos.length > 0 ? ` a ${destinosElegidos.length}` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Membrete + Table occupying remaining space */}
      <div className="flex flex-col flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:border-none print:shadow-none">
        {/* Membrete (fixed height) */}
        <div className="shrink-0">
          {renderMembrete('view')}
        </div>
        {/*
            DE PIE, POR BLOQUES

            La tabla del plan son diez columnas por dieciocho semanas: mil y
            pico de píxeles. De pie se enseña lo mismo contado como lo que es
            —bloques de trabajo con sus semanas dentro—, y la tabla sale en
            cuanto hay ancho, incluido el teléfono tumbado.
        */}
        <div className="flex-1 overflow-auto p-3 min-[700px]:hidden print:hidden">
          <PlanPorBloques
            semanas={weeks}
            columnas={columns}
            fechasDe={fechasDeLaSemana}
            puedeEditar={false}
            alEscribir={() => {}}
            alAlargar={() => {}}
            alAcortar={() => {}}
          />
        </div>

        {/* Table fills remaining height */}
        <div className="rejilla-densa hidden flex-1 overflow-hidden min-[700px]:block print:block">
          {renderViewTable()}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
