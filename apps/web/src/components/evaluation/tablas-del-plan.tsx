'use client';

import {
    Sparkles,
    Plus,
    GripVertical,
    X,
} from 'lucide-react';
import { DEFAULT_PLAN_COLUMNS } from './planColumns';
import { MembreteOficial } from '@/components/documentos/MembreteOficial';
import { getWeekDates } from './planEnSemanas';
import { ExpandHandle, AutoResizeTextarea } from './piezas-del-plan';

import { LAPSOS, type usePlanDeEvaluacion } from './usePlanDeEvaluacion';

type PlanDeEvaluacion = ReturnType<typeof usePlanDeEvaluacion>;

// ────────────────────────────────────────────────
// RENDER: Membrete
// ────────────────────────────────────────────────
export function renderMembrete(c: PlanDeEvaluacion, mode: 'view' | 'edit') {
const {
  selectedLapso,
  localMeta,
  autoPopulated,
  totalWeeks,
  handleMetaChange,
} = c;
  const fields = [
    { key: 'peic',               label: 'P.E.I.C.' },
    { key: 'enfasisCurricular',  label: 'ÉNFASIS CURRICULAR' },
    { key: 'referentesEticos',   label: 'REFERENTES ÉTICOS' },
    { key: 'intencionalidad',    label: 'INTENCIONALIDAD' },
    { key: 'temaIndispensable',  label: 'TEMA INDISPENSABLE' },
  ];
  return (
    <div className="bg-white">
      {/* El membrete oficial del liceo (ministerio, nombre, código DEA…), el mismo de la boleta. */}
      <div className="p-4 pb-2">
        <MembreteOficial respaldo={{ nombre: autoPopulated.instituteName || 'Institución educativa' }} />
      </div>

      <div className="grid grid-cols-4 gap-0 border-t border-gray-200 bg-slate-50 text-xs">
        {[
          ['Docente', autoPopulated.teacherName || 'Sin asignar'],
          ['Área de Formación', autoPopulated.subjectName || '—'],
          ['Año / Sección', `${autoPopulated.classroomGrade ? autoPopulated.classroomGrade + '°' : ''} ${autoPopulated.classroomSection ? '"' + autoPopulated.classroomSection + '"' : '—'}`],
          ['Momento Pedagógico', `${LAPSOS.find(l => l.id === selectedLapso)?.name} — ${autoPopulated.academicYearName || ''}`],
        ].map(([label, val]) => (
          <div key={label} className="px-3 py-2 border-r border-b border-gray-200 last:border-r-0">
            <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide block mb-0.5">{label}</span>
            <span className="font-semibold text-gray-900">{val}</span>
          </div>
        ))}
      </div>

      {/* Separador elegante para que las divisiones de 4 columnas no choquen visualmente con las de 5 */}
      <div className="bg-white px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
        <span>Referentes Curriculares e Institucionales</span>
      </div>

      <div className="grid grid-cols-5 gap-3 bg-white px-3 pb-3 text-xs">
        {fields.map(field => (
          <div key={field.key}>
            {mode === 'edit' ? (
              <label className="block">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide block mb-1">{field.label}</span>
                <textarea
                  value={(localMeta as any)[field.key] || ''}
                  onChange={e => handleMetaChange(field.key, e.target.value)}
                  placeholder={`Escriba ${field.label.toLowerCase()}…`}
                  rows={3}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs leading-snug text-gray-900 placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                />
              </label>
            ) : (
              <>
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide block mb-1">{field.label}</span>
                <span className="text-gray-800 leading-snug font-medium block">{(localMeta as any)[field.key] || '—'}</span>
              </>
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
}

// ────────────────────────────────────────────────
// RENDER: Table (VIEW mode) — with real rowSpan
// ────────────────────────────────────────────────
export function renderViewTable(c: PlanDeEvaluacion) {
const {
  localMeta,
  weeks,
  columns,
  autoPopulated,
  totalPuntos,
  totalPonderacion,
} = c;
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
      <div className="overflow-auto flex-1 min-h-0 overscroll-contain [scrollbar-gutter:stable]">
        <table className="w-full text-[10px] text-left text-gray-700 border-separate border-spacing-0">
          <thead className="text-white uppercase bg-slate-800 sticky top-0 z-20 shadow-md">
            <tr>
              <th className="px-1.5 py-2.5 border-b-2 border-r border-slate-700 first:border-l text-center w-20 min-w-[76px] bg-slate-800 sticky top-0 font-bold whitespace-nowrap">
                FECHA / SEMANA
              </th>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-1.5 py-2.5 border-b-2 border-r border-slate-700 first:border-l bg-slate-800 sticky top-0 font-bold ${
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
              <tr key={w.weekNumber} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-1.5 py-2 border-b border-r border-gray-200 first:border-l text-center align-middle w-20 min-w-[76px] bg-slate-50/40">
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
                      className={`px-1.5 py-2 border-b border-r border-gray-200 first:border-l align-middle ${
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
          <tfoot className="sticky bottom-0 z-20 bg-slate-100 font-bold text-gray-800 shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
            <tr>
              <td
                colSpan={nonNumericCols.length + 1}
                className="px-4 py-2.5 border-t-2 border-b border-r border-gray-300 first:border-l text-right uppercase text-[10px] tracking-wider text-gray-700 bg-slate-100 sticky bottom-0"
              >
                Total Ponderación Acumulada
              </td>
              <td className="px-1.5 py-2.5 border-t-2 border-b border-r border-gray-300 first:border-l text-center font-black text-xs bg-slate-100 sticky bottom-0">
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
              <td className="px-1.5 py-2.5 border-t-2 border-b border-r border-gray-300 first:border-l text-center font-black text-xs text-gray-800 bg-slate-100 sticky bottom-0">
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
}

// ────────────────────────────────────────────────
// RENDER: Table (EDIT mode)
// ────────────────────────────────────────────────
export function renderEditTable(c: PlanDeEvaluacion) {
const {
  localMeta,
  weeks,
  columns,
  autoPopulated,
  totalPuntos,
  totalPonderacion,
  addColumn,
  removeColumn,
  renameColumn,
  moverColumna,
  agarrada,
  setAgarrada,
  encima,
  setEncima,
  soltarColumna,
  setCell,
  expandCell,
  collapseCell,
  handleMetaChange,
} = c;
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
      <div className="overflow-auto flex-1 min-h-0 overscroll-contain [scrollbar-gutter:stable]">
        <table className="w-full text-xs text-left text-gray-800 border-separate border-spacing-0">
          <thead className="text-slate-800 bg-slate-100 sticky top-0 z-20 shadow-[0_1px_0_#cbd5e1]">
            <tr>
              <th className="px-2 py-2 border-b-2 border-r border-slate-300 first:border-l text-center w-20 min-w-[76px] bg-slate-100 sticky top-0 left-0 z-30 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap">
                Semana
              </th>
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  // Se arrastra solo desde la manija: el nombre se sigue pudiendo escribir.
                  draggable={agarrada === i}
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', col.key);
                  }}
                  onDragOver={e => {
                    if (agarrada === null) return;
                    e.preventDefault();
                    if (encima !== i) setEncima(i);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    if (agarrada !== null) moverColumna(agarrada, i);
                    soltarColumna();
                  }}
                  onDragEnd={soltarColumna}
                  className={`px-1.5 py-1.5 border-b-2 border-r border-slate-300 first:border-l bg-slate-100 sticky top-0 align-bottom transition-colors ${
                    agarrada === i ? 'opacity-40' : ''
                  } ${agarrada !== null && encima === i && agarrada !== i ? 'bg-indigo-100 shadow-[inset_0_0_0_2px_#818cf8]' : ''}`}
                  style={{
                    width: col.numeric ? '120px' : undefined,
                    minWidth: col.numeric ? '120px' : '140px',
                  }}
                >
                  <div className="flex items-start gap-0.5">
                    <button
                      type="button"
                      onMouseDown={() => setAgarrada(i)}
                      onMouseUp={() => agarrada === i && encima === null && setAgarrada(null)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowLeft') { e.preventDefault(); moverColumna(i, i - 1); }
                        if (e.key === 'ArrowRight') { e.preventDefault(); moverColumna(i, i + 1); }
                      }}
                      aria-label={`Mover la columna ${col.label} (flechas izquierda y derecha)`}
                      title="Arrastra para cambiarla de lugar"
                      className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <GripVertical className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <AutoResizeTextarea
                      value={col.label}
                      onChange={e => renameColumn(col.key, e.target.value)}
                      className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-bold uppercase leading-tight tracking-wide text-slate-800 hover:border-slate-300 hover:bg-white focus:border-indigo-400 focus:bg-white focus:outline-none"
                      minHeight={20}
                    />
                    {!DEFAULT_PLAN_COLUMNS.find(d => d.key === col.key) && (
                      <button
                        type="button"
                        onClick={() => removeColumn(col.key)}
                        className="mt-0.5 shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Eliminar columna"
                        aria-label={`Eliminar la columna ${col.label}`}
                      >
                        <X className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-1.5 py-1.5 border-b-2 border-r border-slate-300 first:border-l w-24 text-center bg-slate-100 sticky top-0">
                <button
                  type="button"
                  onClick={addColumn}
                  title="Agregar columna (luego arrástrala donde quieras)"
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-indigo-300 bg-white px-2 py-1 text-[11px] font-bold text-indigo-700 hover:border-indigo-500 hover:bg-indigo-50"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Columna
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {weeks.map((w, idx) => {
              return (
                <tr key={w.weekNumber} className="bg-white even:bg-slate-50/50 hover:bg-indigo-50/30 transition-colors">
                  {/* La semana se queda a la vista al deslizar la tabla de lado. */}
                  <td className="px-2 py-2 border-b border-r border-gray-200 first:border-l text-center align-top w-20 bg-slate-50 sticky left-0 z-10">
                    <div className="font-bold text-slate-900 text-xs">Semana {w.weekNumber}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 leading-tight">
                      {getWeekDates(autoPopulated?.lapsoStartDate, w.weekNumber)?.start}
                      <br />al {getWeekDates(autoPopulated?.lapsoStartDate, w.weekNumber)?.end}
                    </div>
                  </td>

                  {columns.map(col => {
                    if (hiddenEdit[col.key].has(idx)) return null;
                    const span = spanMapEdit[col.key].get(idx) || 1;
                    const canCollapse = span > 1;

                    return (
                      <td key={col.key} rowSpan={span} className={`px-1 py-1 border-b border-r border-gray-200 first:border-l align-top relative group ${span > 1 ? 'bg-indigo-50/40' : ''}`}>
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
                              className="w-full px-1 py-1 h-full min-h-[28px] rounded border-none bg-slate-100 text-slate-700 text-xs cursor-not-allowed font-semibold text-center"
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
                              aria-label={`${col.label}, semana ${w.weekNumber}`}
                              className="w-full px-1 py-1 h-full min-h-[28px] rounded border border-slate-300 bg-white outline-none text-xs font-semibold text-center hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                              placeholder="0"
                            />
                          )
                        ) : (
                          <AutoResizeTextarea
                            value={String(w.data[col.key] ?? '')}
                            onChange={e => setCell(idx, col.key, e.target.value)}
                            className="w-full px-1.5 py-1 h-full rounded border border-transparent bg-transparent text-xs leading-snug text-gray-900 placeholder:text-slate-300 outline-none hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                            minHeight={Math.max(28, span * 34)}
                            placeholder="—"
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
                  <td className="px-0.5 py-0.5 border-b border-r border-gray-200 first:border-l bg-slate-50/50 w-24" />
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-slate-100 border-t-2 border-slate-300 font-bold text-gray-800 shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
            <tr>
              <td
                colSpan={nonNumericCols.length + 1}
                className="px-4 py-2 border-t-2 border-b border-r border-gray-300 first:border-l text-right uppercase text-[11px] tracking-wider text-gray-700 bg-slate-100 sticky bottom-0"
              >
                Total Ponderación
              </td>
              <td className="px-1 py-2 border-t-2 border-b border-r border-gray-300 first:border-l text-center font-black text-xs bg-slate-100 sticky bottom-0">
                <span className={totalPonderacion > 100 ? 'text-red-600' : totalPonderacion === 100 ? 'text-emerald-600' : 'text-amber-600'}>
                  {totalPonderacion}%
                </span>
              </td>
              <td className="px-1 py-2 border-t-2 border-b border-r border-gray-300 first:border-l text-center font-black text-xs text-gray-800 bg-slate-100 sticky bottom-0">
                {totalPuntos} pts
              </td>
              <td className="border-t-2 border-b border-r border-gray-300 first:border-l bg-slate-100 sticky bottom-0" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer: Observaciones editables */}
      <label className="block px-4 py-3 bg-white border-t border-gray-200 flex-shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Observaciones</span>
        <textarea
          value={localMeta.observaciones || ''}
          onChange={e => handleMetaChange('observaciones', e.target.value)}
          placeholder="Observaciones finales: criterios generales, recuperaciones, fechas…"
          rows={3}
          className="w-full mt-1 text-sm leading-snug border border-slate-300 bg-white rounded-lg px-3 py-2 text-gray-900 placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-y"
        />
      </label>
    </div>
  );
}
