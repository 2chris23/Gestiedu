import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';
import { SkeletonTable } from '@/components/ui/skeleton/SkeletonTable';

/**
 * Precarga del catalogo de Materias:
 * Encabezado, filtros y tabla de asignaturas con pulsacion suave (CLS = 0).
 */
export default function CargandoMaterias() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando materias...</span>

      {/* Cabecera */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <BaseSkeleton className="h-8 w-44 rounded-lg bg-slate-200/80" />
          <BaseSkeleton className="h-4 w-72 max-w-full rounded-full bg-slate-200/50" />
        </div>
        <BaseSkeleton className="h-10 w-36 rounded-lg bg-slate-200/60" />
      </div>

      {/* Tabla de asignaturas */}
      <SkeletonTable rows={8} showSearch={true} showPagination={true} />
    </div>
  );
}
