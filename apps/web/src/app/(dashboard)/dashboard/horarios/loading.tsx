import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';

/**
 * Precarga de la gestion de Horarios escolares:
 * Cabecera, controles de vista y rejilla de secciones/profesores con pulsacion suave (CLS = 0).
 */
export default function CargandoHorarios() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando horarios escolares...</span>

      {/* Cabecera */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <BaseSkeleton className="h-8 w-44 rounded-lg bg-slate-200/80" />
          <BaseSkeleton className="h-4 w-72 max-w-full rounded-full bg-slate-200/50" />
        </div>
      </div>

      {/* Barra de Controles: Selector de vista y Buscador */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BaseSkeleton className="h-9 w-28 rounded-lg bg-slate-200/70" />
          <BaseSkeleton className="h-9 w-28 rounded-lg bg-slate-200/50" />
        </div>
        <div className="flex items-center gap-3">
          <BaseSkeleton className="h-9 w-48 rounded-lg bg-slate-100" />
          <BaseSkeleton className="h-9 w-36 rounded-lg bg-slate-100" />
        </div>
      </div>

      {/* Rejilla de tarjetas de horarios */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-gray-100 bg-white p-5 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <BaseSkeleton className="h-5 w-28 rounded-md bg-slate-200/80" />
              <BaseSkeleton className="h-5 w-16 rounded-full bg-slate-200/50" />
            </div>
            <div className="space-y-2 pt-2">
              <BaseSkeleton className="h-3 w-full rounded-full bg-slate-200/40" />
              <BaseSkeleton className="h-2 w-full rounded-full bg-slate-100" />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
              <BaseSkeleton className="h-3 w-20 rounded-full bg-slate-200/50" />
              <BaseSkeleton className="h-7 w-20 rounded-lg bg-slate-200/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
