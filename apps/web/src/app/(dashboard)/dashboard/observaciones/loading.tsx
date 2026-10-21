import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';
import { SkeletonCard } from '@/components/ui/skeleton/SkeletonCard';

/**
 * Precarga del modulo de Observaciones y Citaciones:
 * Cabecera, filtros y lista de tarjetas de incidencias con pulsacion suave (CLS = 0).
 */
export default function CargandoObservaciones() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando observaciones y citaciones...</span>

      {/* Cabecera */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <BaseSkeleton className="h-8 w-48 rounded-lg bg-slate-200/80" />
          <BaseSkeleton className="h-4 w-80 max-w-full rounded-full bg-slate-200/50" />
        </div>
        <BaseSkeleton className="h-10 w-36 rounded-lg bg-slate-200/60" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <BaseSkeleton className="h-9 w-60 rounded-lg bg-slate-100" />
        <BaseSkeleton className="h-9 w-36 rounded-lg bg-slate-100" />
        <BaseSkeleton className="h-9 w-32 rounded-lg bg-slate-100" />
      </div>

      {/* Tarjetas de observaciones (Estilo Captura 2) */}
      <div className="space-y-4">
        <SkeletonCard count={3} cardClassName="rounded-2xl" hasBottomPills={true} />
      </div>
    </div>
  );
}
