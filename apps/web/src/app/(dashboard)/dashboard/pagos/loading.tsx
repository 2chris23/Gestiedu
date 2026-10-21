import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';
import { SkeletonKPI } from '@/components/ui/skeleton/SkeletonKPI';
import { SkeletonTable } from '@/components/ui/skeleton/SkeletonTable';

/**
 * Precarga del modulo de Finanzas y Pagos:
 * Cabecera, selector de ciclo, pestanas, 4 KPIs financieros y tabla de datos (CLS = 0).
 */
export default function CargandoPagos() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando finanzas y pagos...</span>

      {/* Cabecera y Selector de Ciclo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <BaseSkeleton className="h-8 w-44 rounded-lg bg-slate-200/80" />
          <BaseSkeleton className="h-4 w-72 max-w-full rounded-full bg-slate-200/50" />
        </div>
        <BaseSkeleton className="h-10 w-48 rounded-xl bg-slate-200/60" />
      </div>

      {/* Pestanas de Finanzas */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white p-3">
            <BaseSkeleton className="h-5 w-5 rounded-md bg-slate-200/60" />
            <BaseSkeleton className="h-4 w-20 rounded-full bg-slate-200/70" />
          </div>
        ))}
      </div>

      {/* 4 KPIs de Finanzas */}
      <SkeletonKPI count={4} />

      {/* Tabla de movimientos / estudiantes */}
      <SkeletonTable rows={6} showSearch={true} showPagination={true} />
    </div>
  );
}
