import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';
import { SkeletonCard } from '@/components/ui/skeleton/SkeletonCard';

/**
 * Precarga de la ficha de perfil de usuario (estudiante, profesor, tutor, admin):
 * Cabecera con avatar grande, datos personales y pestanas con pulsacion suave (CLS = 0).
 */
export default function CargandoPerfilUsuario() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando perfil de usuario...</span>

      {/* 1. Cabecera de Perfil */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs">
        {/* Banner superior */}
        <BaseSkeleton className="h-28 w-full bg-slate-200/50" />

        {/* Fila de informacion: Avatar circular + datos */}
        <div className="relative px-6 pb-6 pt-3">
          <div className="-mt-16 mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <BaseSkeleton className="h-24 w-24 rounded-full border-4 border-white bg-slate-200/80 shadow-md" />
              <div className="space-y-2 pb-1">
                <BaseSkeleton className="h-6 w-48 rounded-md bg-slate-200/80" />
                <div className="flex items-center gap-2">
                  <BaseSkeleton className="h-4 w-24 rounded-full bg-slate-200/50" />
                  <BaseSkeleton className="h-5 w-20 rounded-full bg-indigo-100/70" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <BaseSkeleton className="h-9 w-28 rounded-lg bg-slate-200/50" />
            </div>
          </div>

          {/* Pestanas del perfil */}
          <div className="flex gap-6 border-t border-gray-100 pt-3">
            <BaseSkeleton className="h-4 w-24 rounded-full bg-indigo-200/70" />
            <BaseSkeleton className="h-4 w-20 rounded-full bg-slate-200/40" />
            <BaseSkeleton className="h-4 w-28 rounded-full bg-slate-200/40" />
            <BaseSkeleton className="h-4 w-24 rounded-full bg-slate-200/40" />
          </div>
        </div>
      </div>

      {/* 2. Cuerpo del perfil (Tarjetas de detalle estilo Captura 2) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonCard count={1} cardClassName="rounded-2xl" hasBottomPills={false} />
        <SkeletonCard count={1} cardClassName="rounded-2xl" hasBottomPills={false} />
      </div>
    </div>
  );
}
