import React, { useEffect, useCallback, useRef } from 'react';
import {
    ArrowLeft,
    ChevronDown,
} from 'lucide-react';
import { DEFAULT_PLAN_COLUMNS } from './planColumns';
import { useDejarGirar } from '@/hooks/useDejarGirar';
import { type WeekRow } from './planEnSemanas';

/** Converts WeekRow[] → flat rows for DB save */
export function weekRowsToDbRows(weeks: WeekRow[], totalWeeks: number): any[] {
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
export function ExpandHandle({ onExpand, onCollapse, canCollapse }: {
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
export function AutoResizeTextarea({
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

  // Y cuando cambia su ancho (una columna que se mueve, la ventana que se
  // estrecha): si no, el título se quedaba cortado («TIPO DE» sin «EVAL.»).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const vigia = new ResizeObserver(() => resize());
    vigia.observe(el);
    return () => vigia.disconnect();
  }, [resize]);

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

/** La hoja del plan a pantalla completa: se arrastra en las dos direcciones y deja girar el teléfono. */
export function PlanCompleto({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: React.ReactNode }) {
  useDejarGirar();
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [alCerrar]);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-100" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="zona-segura-arriba flex shrink-0 items-center gap-2 bg-white px-2 py-2 shadow-sm">
        <button type="button" onClick={alCerrar} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-gray-900">{titulo}</p>
          <p className="truncate text-xs text-gray-600 min-[700px]:hidden">Gira el teléfono para verlo mejor</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-4">{children}</div>
    </div>
  );
}
