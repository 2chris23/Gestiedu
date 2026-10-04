import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';

/**
 * Precarga de la emision de Carnets estudiantiles:
 * Cabecera y cuadricula de tarjetas de carnets con pulsacion suave (CLS = 0).
 */
export default function CargandoCarnets() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando carnets...</span>

      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BaseSkeleton className="h-10 w-10 rounded-lg bg-slate-200/60" />
          <BaseSkeleton className="h-7 w-48 rounded-md bg-slate-200/80" />
        </div>
        <BaseSkeleton className="h-10 w-32 rounded-lg bg-slate-200/60" />
      </div>

      {/* Rejilla de carnets (2 columnas) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
            <BaseSkeleton className="h-28 w-24 shrink-0 rounded-lg bg-slate-200/60" />
            <div className="flex-1 space-y-2 pt-1">
              <BaseSkeleton className="h-3 w-36 rounded-full bg-slate-200/50" />
              <BaseSkeleton className="h-4 w-44 rounded-md bg-slate-200/80" />
              <BaseSkeleton className="h-3 w-28 rounded-full bg-slate-200/50" />
              <div className="pt-2">
                <BaseSkeleton className="h-3 w-20 rounded-full bg-slate-200/40" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
