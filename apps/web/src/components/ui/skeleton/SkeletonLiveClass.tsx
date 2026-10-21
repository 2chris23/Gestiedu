import React from 'react';
import { cn } from '@/lib/utils';
import { BaseSkeleton } from './BaseSkeleton';

export interface SkeletonLiveClassProps {
  className?: string;
  studentCount?: number;
  shimmer?: boolean;
}

/**
 * Precarga de la interfaz de Clase en Vivo (asistencia en tiempo real, evaluacion activa).
 * Recrea la cabecera del aula, selector rapido y tarjetas de lista de asistencia (CLS = 0).
 */
export function SkeletonLiveClass({
  className,
  studentCount = 8,
  shimmer = true,
}: SkeletonLiveClassProps) {
  return (
    <div
      className={cn('space-y-6 pb-12', className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando clase en vivo...</span>

      {/* 1. Cabecera de Clase */}
      <header className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Boton volver */}
            <BaseSkeleton className="h-10 w-10 shrink-0 rounded-xl bg-slate-200/60" shimmer={shimmer} />
            <div className="min-w-0 space-y-2">
              <BaseSkeleton className="h-3 w-32 rounded-full bg-slate-200/60" shimmer={shimmer} />
              <div className="flex items-center gap-2">
                <BaseSkeleton className="h-6 w-48 rounded-md bg-slate-200/80" shimmer={shimmer} />
                <BaseSkeleton className="h-5 w-20 rounded-full bg-indigo-100/70" shimmer={shimmer} />
              </div>
            </div>
          </div>

          {/* Botones de accion derechos */}
          <div className="flex items-center gap-2">
            <BaseSkeleton className="h-9 w-24 rounded-lg bg-slate-200/50" shimmer={shimmer} />
            <BaseSkeleton className="h-9 w-32 rounded-lg bg-slate-200/70" shimmer={shimmer} />
          </div>
        </div>

        {/* Fila secundaria: Profesor, aula, horario */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3">
          <BaseSkeleton className="h-4 w-36 rounded-full bg-slate-200/50" shimmer={shimmer} />
          <BaseSkeleton className="h-4 w-28 rounded-full bg-slate-200/50" shimmer={shimmer} />
          <BaseSkeleton className="h-4 w-44 rounded-full bg-slate-200/50" shimmer={shimmer} />
        </div>
      </header>

      {/* 2. Barra de Control Rapido de Asistencia */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Presentes', color: 'border-l-emerald-400' },
          { label: 'Tardes', color: 'border-l-amber-400' },
          { label: 'Ausentes', color: 'border-l-rose-400' },
          { label: 'Pendientes', color: 'border-l-slate-300' },
        ].map((item, idx) => (
          <div
            key={idx}
            className={cn(
              'rounded-xl border border-gray-100 border-l-4 bg-white p-3 shadow-xs',
              item.color
            )}
          >
            <div className="flex items-center justify-between">
              <BaseSkeleton className="h-3 w-16 rounded-full bg-slate-200/60" shimmer={shimmer} />
              <BaseSkeleton className="h-5 w-8 rounded-md bg-slate-200/70" shimmer={shimmer} />
            </div>
          </div>
        ))}
      </div>

      {/* 3. Nomina de Estudiantes con Selector de Asistencia */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <BaseSkeleton className="h-9 w-64 rounded-lg bg-slate-100" shimmer={shimmer} />
          <div className="flex items-center gap-2">
            <BaseSkeleton className="h-8 w-28 rounded-lg bg-slate-100" shimmer={shimmer} />
            <BaseSkeleton className="h-8 w-28 rounded-lg bg-slate-100" shimmer={shimmer} />
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {Array.from({ length: studentCount }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              {/* Estudiante: Avatar + Nombre + Cedula */}
              <div className="flex items-center gap-3">
                <BaseSkeleton
                  className="h-10 w-10 shrink-0 rounded-full bg-slate-200/70"
                  shimmer={shimmer}
                />
                <div className="space-y-1.5">
                  <BaseSkeleton
                    className="h-3.5 w-40 rounded-full bg-slate-200/80"
                    shimmer={shimmer}
                  />
                  <BaseSkeleton
                    className="h-2.5 w-24 rounded-full bg-slate-200/50"
                    shimmer={shimmer}
                  />
                </div>
              </div>

              {/* Botonera de asistencia: Presente, Tarde, Ausente */}
              <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-center">
                <BaseSkeleton className="h-9 w-12 rounded-lg bg-emerald-50" shimmer={shimmer} />
                <BaseSkeleton className="h-9 w-12 rounded-lg bg-amber-50" shimmer={shimmer} />
                <BaseSkeleton className="h-9 w-12 rounded-lg bg-rose-50" shimmer={shimmer} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
