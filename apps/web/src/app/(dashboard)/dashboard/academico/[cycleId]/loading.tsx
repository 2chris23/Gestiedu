import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';
import { SkeletonKPI } from '@/components/ui/skeleton/SkeletonKPI';
import { SkeletonCard } from '@/components/ui/skeleton/SkeletonCard';

/**
 * Precarga de alta fidelidad para la vista de detalle de Ciclo Academico:
 * Cabecera con titulo/estado, metricas globales del ciclo y lista de anios/secciones (CLS = 0).
 */
export default function CargandoDetalleCiclo() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando ciclo escolar...</span>

      {/* 1. Cabecera con boton Volver, Titulo y Acciones */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BaseSkeleton className="h-6 w-20 rounded-md bg-slate-200/60" />
            <BaseSkeleton className="h-4 w-4 rounded-full bg-slate-200/40" />
            <BaseSkeleton className="h-6 w-28 rounded-md bg-slate-200/60" />
          </div>
          <div className="flex items-center gap-3">
            <BaseSkeleton className="h-9 w-48 rounded-lg bg-slate-200/80" />
            <BaseSkeleton className="h-6 w-24 rounded-full bg-slate-200/50" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BaseSkeleton className="h-10 w-32 rounded-lg bg-slate-200/60" />
          <BaseSkeleton className="h-10 w-10 rounded-lg bg-slate-200/50" />
        </div>
      </div>

      {/* 2. Metricas globales del ciclo */}
      <SkeletonKPI count={4} />

      {/* 3. Filtros y selector de turno */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex gap-2">
          <BaseSkeleton className="h-8 w-20 rounded-lg bg-slate-200/60" />
          <BaseSkeleton className="h-8 w-24 rounded-lg bg-slate-200/50" />
          <BaseSkeleton className="h-8 w-20 rounded-lg bg-slate-200/50" />
        </div>
        <BaseSkeleton className="h-8 w-36 rounded-lg bg-slate-200/60" />
      </div>

      {/* 4. Acordeones de anios y secciones */}
      <div className="space-y-4">
        <SkeletonCard count={3} cardClassName="rounded-xl p-5" hasBottomPills={false} />
      </div>
    </div>
  );
}
