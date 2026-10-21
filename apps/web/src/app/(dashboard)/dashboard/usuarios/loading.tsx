import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';
import { SkeletonTable } from '@/components/ui/skeleton/SkeletonTable';

/**
 * Precarga del directorio de Usuarios:
 * Cabecera, selector de roles y tabla de usuarios con pulsacion suave (CLS = 0).
 */
export default function CargandoUsuarios() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando directorio de usuarios...</span>

      {/* Cabecera */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BaseSkeleton className="h-8 w-36 rounded-lg bg-slate-200/80" />
          <BaseSkeleton className="h-6 w-16 rounded-full bg-slate-200/50" />
        </div>
        <div className="flex items-center gap-2">
          <BaseSkeleton className="h-10 w-32 rounded-lg bg-slate-200/60" />
        </div>
      </div>

      {/* Tabla de usuarios */}
      <SkeletonTable rows={10} showSearch={true} showPagination={true} />
    </div>
  );
}
