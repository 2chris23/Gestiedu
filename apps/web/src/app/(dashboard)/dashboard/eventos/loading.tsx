import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';

/**
 * Precarga de la vista de Calendario y Eventos escolares:
 * Cabecera, navegacion de mes y cuadricula de calendario con pulsacion suave (CLS = 0).
 */
export default function CargandoEventos() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando calendario escolar...</span>

      {/* Cabecera */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <BaseSkeleton className="h-8 w-44 rounded-lg bg-slate-200/80" />
          <BaseSkeleton className="h-4 w-72 max-w-full rounded-full bg-slate-200/50" />
        </div>
        <BaseSkeleton className="h-10 w-36 rounded-lg bg-slate-200/60" />
      </div>

      {/* Controles de Navegacion del Mes */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-xs">
        <BaseSkeleton className="h-6 w-36 rounded-md bg-slate-200/70" />
        <div className="flex items-center gap-2">
          <BaseSkeleton className="h-8 w-8 rounded-lg bg-slate-200/50" />
          <BaseSkeleton className="h-8 w-8 rounded-lg bg-slate-200/50" />
        </div>
      </div>

      {/* Matriz del Calendario (7 columnas x 5 filas) */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-slate-50/70 p-3 text-center">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex justify-center">
              <BaseSkeleton className="h-3.5 w-10 rounded-full bg-slate-200/60" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[85px] p-2 space-y-2">
              <BaseSkeleton className="h-3.5 w-4 rounded-full bg-slate-200/40" />
              {i % 4 === 1 && (
                <BaseSkeleton className="h-4 w-full rounded-md bg-indigo-100/60" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
