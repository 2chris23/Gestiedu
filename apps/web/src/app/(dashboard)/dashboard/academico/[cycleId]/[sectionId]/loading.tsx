import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';
import { SkeletonTable } from '@/components/ui/skeleton/SkeletonTable';

/**
 * Precarga de la ficha de seccion y nomina de estudiantes:
 * Cabecera con profesor guia, estadisticas de aula y tabla de alumnos con pulsacion suave (CLS = 0).
 */
export default function CargandoSeccion() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando seccion y estudiantes...</span>

      {/* 1. Cabecera: Titulo, enlaces y Tarjeta de Profesor Guia */}
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BaseSkeleton className="h-6 w-20 rounded-md bg-slate-200/60" />
              <BaseSkeleton className="h-4 w-4 rounded-full bg-slate-200/40" />
              <BaseSkeleton className="h-6 w-28 rounded-md bg-slate-200/60" />
            </div>
            <BaseSkeleton className="h-8 w-44 rounded-lg bg-slate-200/80" />
          </div>

          {/* Tarjeta de Profesor Guia */}
          <div className="w-full rounded-xl border border-gray-100 bg-white p-4 shadow-xs sm:w-auto sm:min-w-[360px]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BaseSkeleton className="h-12 w-12 rounded-full bg-slate-200/70" />
                <div className="space-y-1.5">
                  <BaseSkeleton className="h-3 w-20 rounded-full bg-slate-200/50" />
                  <BaseSkeleton className="h-4 w-32 rounded-full bg-slate-200/80" />
                </div>
              </div>
              <BaseSkeleton className="h-8 w-20 rounded-lg bg-slate-200/50" />
            </div>
          </div>
        </div>

        {/* 2. Estadisticas de la seccion */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs">
              <BaseSkeleton className="h-3 w-20 rounded-full bg-slate-200/50" />
              <BaseSkeleton className="mt-2 h-7 w-16 rounded-md bg-slate-200/80" />
            </div>
          ))}
        </div>
      </header>

      {/* 3. Pestanas de navegacion (Estudiantes, Materias, Calificaciones, Observaciones) */}
      <div className="flex gap-6 border-b border-gray-200 pb-2">
        <BaseSkeleton className="h-5 w-24 rounded-full bg-indigo-200/70" />
        <BaseSkeleton className="h-5 w-20 rounded-full bg-slate-200/50" />
        <BaseSkeleton className="h-5 w-28 rounded-full bg-slate-200/50" />
        <BaseSkeleton className="h-5 w-24 rounded-full bg-slate-200/50" />
      </div>

      {/* 4. Tabla de Estudiantes */}
      <SkeletonTable rows={8} showSearch={true} showPagination={true} />
    </div>
  );
}
