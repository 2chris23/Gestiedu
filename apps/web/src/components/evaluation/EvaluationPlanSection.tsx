'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { planWeekRangeFromRange } from '@/lib/plan-weeks';
import { toast } from 'sonner';
import {
  Save, Printer, ArrowLeft, Edit2,
  Sparkles, BookOpen, Plus, Trash2, RotateCcw, Zap, ChevronDown, GripVertical, X, Upload
} from 'lucide-react';
import {
  useEvaluationPlanMetadata,
  useUpsertEvaluationPlanMetadata,
  useEvaluationPlanRows,
  useBatchUpsertRows,
  type EvaluationPlanRow,
  type EvaluationPlanMetadata,
  type AutoPopulatedData
} from '@/hooks/useEvaluationPlan';
import api from '@/lib/axios';
import { DEFAULT_PLAN_COLUMNS, type PlanColumnDef } from './planColumns';

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
  dbRows.forEach(r => {
    const wn = (r.weekNumber || 1) - 1;
    if (wn < 0 || wn >= base.length) return;
    const span = r.endWeekNumber ? Math.max(1, r.endWeekNumber - r.weekNumber! + 1) : 1;
    // Store all data fields
    const d: Record<string, string | number> = {};
    (DEFAULT_PLAN_COLUMNS as ColDef[]).forEach(col => {
      const val = (r as any)[col.key];
      if (val !== undefined && val !== null) d[col.key] = val;
    });
    // Also store any extra keys (custom columns)
    const extra = (r as any).extraData;
    if (extra) {
      try { Object.assign(d, typeof extra === 'string' ? JSON.parse(extra) : extra); } catch {}
    }
    base[wn].data = d;
    // Apply span to all mergeable columns
    DEFAULT_PLAN_COLUMNS.filter(c => c.mergeable).forEach(col => {
      base[wn].colSpan[col.key] = span;
    });
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
      weekNumber: w.weekNumber,
      endWeekNumber: Math.min(w.weekNumber + maxSpan - 1, totalWeeks),
      rowType: 'EVALUATION',
      orderIndex: idx,
    };
    DEFAULT_PLAN_COLUMNS.forEach(col => {
      // PONDERACIÓN DERIVADA: única fuente de verdad = Puntos (escala 0-20).
      row[col.key] = col.key === 'ponderacion'
        ? Math.round((Number(w.data['puntos'] || 0) / 20) * 100 * 100) / 100
        : w.data[col.key] ?? (col.numeric ? 0 : '');
    });
    // Store extra cols as extraData JSON
    const extraKeys = Object.keys(w.data).filter(k => !DEFAULT_PLAN_COLUMNS.find(c => c.key === k));
    if (extraKeys.length > 0) {
      const extraData: any = {};
      extraKeys.forEach(k => { extraData[k] = w.data[k]; });
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
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-1 pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
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

  // ── Local state ──────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [localMeta, setLocalMeta] = useState<Partial<EvaluationPlanMetadata>>({});
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [columns, setColumns] = useState<ColDef[]>([...DEFAULT_PLAN_COLUMNS]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

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
  useEffect(() => {
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
  }, [metaData]);

  useEffect(() => {
    const tw = autoPopulated.lapsoWeeks || localMeta.totalSemanas || 24;
    if (rowsData?.rows && rowsData.rows.length > 0) {
      setWeeks(dbRowsToWeekRows(rowsData.rows, tw));
    } else {
      setWeeks(buildEmptyWeekRows(tw));
    }
  }, [rowsData, autoPopulated.lapsoWeeks, localMeta.totalSemanas]);

  // ── Totals ────────────────────────────────────
  const totalPonderacion = useMemo(() =>
    weeks.reduce((s, w) => s + (Number(w.data['ponderacion']) || 0), 0)
  , [weeks]);
  const totalPuntos = useMemo(() =>
    weeks.reduce((s, w) => s + (Number(w.data['puntos']) || 0), 0)
  , [weeks]);

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

  // ── Helpers: cell mutation ────────────────────
  const setCell = useCallback((weekIdx: number, colKey: string, value: string | number) => {
    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      next[weekIdx].data[colKey] = value;
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

    const pPerItem = Math.round((100 / activeIdxs.length) * 100) / 100;
    const ptPerItem = Math.round((20 / activeIdxs.length) * 100) / 100;

    setWeeks(prev => {
      const next = prev.map(w => ({ ...w, data: { ...w.data }, colSpan: { ...w.colSpan } }));
      activeIdxs.forEach((idx, i) => {
        // last gets remainder
        const isLast = i === activeIdxs.length - 1;
        const usedP = pPerItem * i;
        const usedPt = ptPerItem * i;
        next[idx].data['ponderacion'] = isLast ? Math.round((100 - usedP) * 100) / 100 : pPerItem;
        next[idx].data['puntos'] = isLast ? Math.round((20 - usedPt) * 100) / 100 : ptPerItem;
      });
      return next;
    });
  };

  // ── Save ──────────────────────────────────────
  const handleSave = async () => {
    try {
      await saveMeta({
        classroomId, subjectId, lapso,
        ...localMeta,
        customColumns: JSON.stringify(columns),
      });
      const dbRows = weekRowsToDbRows(weeks, totalWeeks);
      await saveRows({ classroomId, subjectId, lapso, rows: dbRows });
      setIsEditing(false);
    } catch {
      toast.error('Error al guardar el plan de evaluación.');
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
                <span>{(localMeta as any)[field.key] || '—'}</span>
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

    return (
      <div className="flex flex-col h-full">
        {/* Sticky thead */}
        <div className="overflow-x-auto flex-shrink-0">
          <table className="w-full text-[10px] text-left text-gray-700 border-collapse">
            <colgroup>
              <col style={{ width: '96px' }} />
              {columns.map(col => <col key={col.key} style={{ minWidth: col.numeric ? '60px' : '100px', width: col.numeric ? '60px' : 'auto' }} />)}
            </colgroup>
            <thead className="text-white uppercase bg-slate-800">
              <tr>
                <th className="px-2 py-2 border border-slate-700 text-center w-24">FECHA / SEMANA</th>
                {columns.map(col => (
                  <th key={col.key} className="px-2 py-2 border border-slate-700">{col.label}</th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable tbody */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-[10px] text-left text-gray-700 border-collapse">
            <colgroup>
              <col style={{ width: '96px' }} />
              {columns.map(col => <col key={col.key} style={{ minWidth: col.numeric ? '60px' : '100px', width: col.numeric ? '60px' : 'auto' }} />)}
            </colgroup>
            <tbody>
              {weeks.map((w, idx) => (
                <tr key={w.weekNumber} className="bg-white border-b border-gray-200">
                  <td className="px-2 py-2 border border-gray-200 text-center align-middle w-24">
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
                      <td key={col.key} rowSpan={span} className="px-2 py-2 border border-gray-200 align-middle">
                        <div className="whitespace-pre-wrap font-medium text-gray-700">
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
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-300 flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-gray-200">
            <span className="text-[10px] font-bold uppercase text-gray-600">Total Ponderación Acumulada</span>
            <div className="flex items-center gap-4">
              <div className={`text-sm font-black ${
                totalPonderacion > 100 ? 'text-red-600' : totalPonderacion === 100 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {totalPonderacion}%
                {totalPonderacion < 100 && <span className="text-[10px] font-normal text-gray-400 ml-1">(faltan {100 - totalPonderacion}%)</span>}
                {totalPonderacion > 100 && <span className="text-[10px] font-normal text-red-400 ml-1">(exceso {totalPonderacion - 100}%)</span>}
              </div>
              <div className="text-sm font-black text-gray-700">{totalPuntos} pts</div>
            </div>
          </div>
          <div className="px-4 py-2 bg-white">
            <span className="text-[10px] font-bold uppercase text-gray-500">Observaciones:</span>
            <p className="text-xs mt-1 text-gray-700">{localMeta.observaciones || 'Sin observaciones.'}</p>
          </div>
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

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Sticky thead */}
        <div className="overflow-x-auto flex-shrink-0">
          <table className="w-full text-[10px] text-left text-gray-700 border-collapse">
            <thead className="text-white uppercase bg-slate-800">
              <tr>
                <th className="px-1 py-1 border border-slate-700 text-center w-20">FECHA/SEM.</th>
                {columns.map(col => (
                  <th key={col.key} className="px-1 py-1 border border-slate-700" style={{ minWidth: col.numeric ? '60px' : '100px', width: col.numeric ? '60px' : 'auto' }}>
                    <div className="flex items-center gap-1">
                      <AutoResizeTextarea
                        value={col.label}
                        onChange={e => renameColumn(col.key, e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-1 py-0.5 text-white w-full focus:outline-none focus:ring-1 focus:ring-indigo-400 text-[10px] min-w-0 text-center leading-tight"
                        minHeight={20}
                      />
                      {!DEFAULT_PLAN_COLUMNS.find(d => d.key === col.key) && (
                        <button
                          onClick={() => removeColumn(col.key)}
                          className="text-red-300 hover:text-red-100 shrink-0"
                          title="Eliminar columna"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-1 py-1 border border-slate-700 w-8 text-center">
                  <button onClick={addColumn} title="Agregar columna" className="bg-indigo-500 hover:bg-indigo-400 text-white rounded p-0.5 transition-colors">
                    <Plus className="w-3 h-3 mx-auto" />
                  </button>
                </th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable tbody */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-[10px] text-left text-gray-700 border-collapse">
            <colgroup>
              <col style={{ width: '80px' }} />
              {columns.map(col => <col key={col.key} style={{ minWidth: col.numeric ? '60px' : '100px', width: col.numeric ? '60px' : 'auto' }} />)}
              <col style={{ width: '32px' }} />
            </colgroup>
            <tbody>
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
                              // PONDERACIÓN DERIVADA: única fuente de verdad = Puntos.
                              // Se muestra calculada (puntos/20*100) y no se edita.
                              <input
                                type="number"
                                readOnly
                                value={String(Math.round((Number(w.data['puntos'] ?? 0) / 20) * 10000) / 100.00001 || 0)}
                                className="w-full px-1 py-0.5 h-full min-h-[22px] border-none bg-gray-100 text-gray-500 text-[10px] cursor-not-allowed"
                                title="La ponderación se deriva de los Puntos (puntos/20×100). Edita Puntos."
                                placeholder="0"
                              />
                            ) : (
                              <input
                                type="number"
                                value={String(w.data[col.key] ?? '')}
                                onChange={e => setCell(idx, col.key, parseFloat(e.target.value) || 0)}
                                className="w-full px-1 py-0.5 h-full min-h-[22px] border-none focus:ring-1 focus:ring-indigo-500 outline-none bg-transparent text-[10px]"
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
                    <td className="border border-gray-100 bg-gray-50 w-8" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className="border-t border-gray-300 flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-1.5 bg-slate-50 border-b border-gray-200">
            <span className="text-[10px] font-bold uppercase text-gray-600">Total Ponderación</span>
            <div className="flex items-center gap-4">
              <div className={`text-sm font-black ${
                totalPonderacion > 100 ? 'text-red-600' : totalPonderacion === 100 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {totalPonderacion}%
              </div>
              <div className="text-sm font-black text-gray-700">{totalPuntos} pts</div>
            </div>
          </div>
          <div className="px-4 py-2 bg-white">
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
            <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600">
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

        {/* HINT BAR */}
        <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-2 flex items-center gap-3 text-xs text-indigo-700 shrink-0">
          <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
          <span>
            <strong>Tip:</strong> Cada fila es una semana del lapso. Para que un tema abarque varias semanas, escríbelo y luego pasa el cursor sobre la celda — aparecerá un botón <strong>↓</strong> para expandirla hacia abajo. Añade o elimina columnas desde la cabecera de la tabla (➕ / ✕).
          </span>
        </div>

        {/* CANVAS */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1600px] mx-auto space-y-4">
            <div className="rounded-xl overflow-hidden shadow-xl border border-gray-300">
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
            <button onClick={() => setIsEditing(true)} className="flex items-center px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-bold text-xs">
              <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Editar Plan
            </button>
          )}
        </div>
      </div>

      {/* Membrete + Table occupying remaining space */}
      <div className="flex flex-col flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:border-none print:shadow-none">
        {/* Membrete (fixed height) */}
        <div className="shrink-0">
          {renderMembrete('view')}
        </div>
        {/* Table fills remaining height */}
        <div className="flex-1 overflow-hidden">
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
