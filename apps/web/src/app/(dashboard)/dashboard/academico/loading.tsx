import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';
import { SkeletonCard } from '@/components/ui/skeleton/SkeletonCard';

/**
 * Precarga de la vista de Ciclos Escolares:
 * Cabecera con titulo/descripcion y tarjetas de ciclos escolares con pulsacion suave (CLS = 0).
 */
export default function CargandoAcademico() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando ciclos escolares...</span>

      {/* Cabecera de pantalla */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <BaseSkeleton className="h-8 w-48 rounded-lg bg-slate-200/80" />
          <BaseSkeleton className="h-4 w-80 max-w-full rounded-full bg-slate-200/50" />
        </div>
        <BaseSkeleton className="h-10 w-32 rounded-lg bg-slate-200/60" />
      </div>

      {/* Tarjetas de ciclos académicos */}
      <div className="space-y-4">
        <SkeletonCard count={3} cardClassName="rounded-2xl" hasBottomPills={true} />
      </div>
    </div>
  );
}
