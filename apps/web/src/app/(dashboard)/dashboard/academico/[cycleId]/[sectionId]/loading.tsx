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

      {/* 1. Cabecera en una línea (flecha, título, lapso y documentos) y el profesor guía */}
      <header className="space-y-4">
        <div className="flex items-center gap-2">
          <BaseSkeleton className="h-11 w-11 rounded-full bg-slate-200/40" />
          <div className="flex-1 space-y-1.5">
            <BaseSkeleton className="h-6 w-28 rounded-lg bg-slate-200/80" />
            <BaseSkeleton className="h-3 w-16 rounded-full bg-slate-200/50" />
          </div>
          <BaseSkeleton className="h-11 w-28 rounded-xl bg-slate-200/50" />
          <BaseSkeleton className="h-11 w-11 rounded-full bg-slate-200/50" />
        </div>

        <div className="w-full rounded-[24px] bg-white px-4 py-3 ring-1 ring-gray-200 sm:max-w-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BaseSkeleton className="h-12 w-12 rounded-full bg-slate-200/70" />
              <div className="space-y-1.5">
                <BaseSkeleton className="h-3 w-20 rounded-full bg-slate-200/50" />
                <BaseSkeleton className="h-4 w-32 rounded-full bg-slate-200/80" />
              </div>
            </div>
            <BaseSkeleton className="h-11 w-24 rounded-full bg-slate-200/50" />
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

      {/* 3. Las partes, en cuadros (Estudiantes, Materias, Observaciones…) */}
      <div className="grid grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <BaseSkeleton className={`h-[52px] w-[52px] rounded-[18px] ${i === 0 ? 'bg-indigo-200/70' : 'bg-slate-200/50'}`} />
            <BaseSkeleton className="h-3 w-14 rounded-full bg-slate-200/50" />
          </div>
        ))}
      </div>

      {/* 4. Tabla de Estudiantes */}
      <SkeletonTable rows={8} showSearch={true} showPagination={true} />
    </div>
  );
}
