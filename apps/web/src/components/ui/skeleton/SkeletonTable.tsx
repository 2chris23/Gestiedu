import React from 'react';
import { cn } from '@/lib/utils';
import { BaseSkeleton } from './BaseSkeleton';

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
  showSearch?: boolean;
  showPagination?: boolean;
  compactMobile?: boolean;
  shimmer?: boolean;
}

/**
 * Precarga de tablas (estudiantes, evaluaciones, finanzas, usuarios).
 * Reproduce la estructura de TablaAdaptable con soporte responsivo y pulsacion suave (CLS = 0).
 */
export function SkeletonTable({
  rows = 6,
  columns = 5,
  className,
  showSearch = true,
  showPagination = true,
  compactMobile = true,
  shimmer = true,
}: SkeletonTableProps) {
  return (
    <div
      className={cn('w-full rounded-xl border border-gray-200 bg-white shadow-xs', className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando registros de la tabla...</span>

      {/* Barra superior opcional: Buscador y botones de accion */}
      {showSearch && (
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm w-full">
            <BaseSkeleton
              className="h-10 w-full rounded-lg bg-slate-100"
              shimmer={shimmer}
            />
          </div>
          <div className="flex items-center gap-2">
            <BaseSkeleton
              className="h-9 w-28 rounded-lg bg-slate-100"
              shimmer={shimmer}
            />
          </div>
        </div>
      )}

      {/* Cabecera de la tabla (en escritorio) */}
      <div className="hidden border-b border-gray-100 bg-slate-50/70 px-5 py-3.5 sm:grid sm:grid-cols-12 sm:gap-4">
        <div className="col-span-4">
          <BaseSkeleton className="h-3.5 w-24 rounded-full bg-slate-200/70" shimmer={shimmer} />
        </div>
        <div className="col-span-3">
          <BaseSkeleton className="h-3.5 w-20 rounded-full bg-slate-200/60" shimmer={shimmer} />
        </div>
        <div className="col-span-2">
          <BaseSkeleton className="h-3.5 w-16 rounded-full bg-slate-200/60" shimmer={shimmer} />
        </div>
        <div className="col-span-2 text-right">
          <BaseSkeleton className="h-3.5 w-14 ml-auto rounded-full bg-slate-200/60" shimmer={shimmer} />
        </div>
        <div className="col-span-1 text-right">
          <BaseSkeleton className="h-3.5 w-8 ml-auto rounded-full bg-slate-200/60" shimmer={shimmer} />
        </div>
      </div>

      {/* Filas */}
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3.5 sm:grid sm:grid-cols-12 sm:gap-4 sm:px-5 sm:py-4"
          >
            {/* Columna Principal: Avatar + 2 lineas de texto (Nombre y codigo/cedula) */}
            <div className="col-span-4 flex min-w-0 items-center gap-3">
              <BaseSkeleton
                className="h-9 w-9 shrink-0 rounded-full bg-slate-200/70"
                shimmer={shimmer}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <BaseSkeleton
                  className="h-3.5 w-3/4 rounded-full bg-slate-200/80"
                  shimmer={shimmer}
                />
                <BaseSkeleton
                  className="h-2.5 w-1/2 rounded-full bg-slate-200/50"
                  shimmer={shimmer}
                />
              </div>
            </div>

            {/* Columna 2: Estado o nivel (Desktop) */}
            <div className="hidden col-span-3 sm:flex sm:items-center">
              <BaseSkeleton
                className="h-6 w-24 rounded-full bg-slate-200/55"
                shimmer={shimmer}
              />
            </div>

            {/* Columna 3: Dato complementario / Fecha (Desktop) */}
            <div className="hidden col-span-2 sm:flex sm:items-center">
              <BaseSkeleton
                className="h-3 w-16 rounded-full bg-slate-200/50"
                shimmer={shimmer}
              />
            </div>

            {/* Columna 4: Metrica o indicador (Desktop) */}
            <div className="hidden col-span-2 sm:flex sm:items-center sm:justify-end">
              <BaseSkeleton
                className="h-5 w-14 rounded-md bg-slate-200/60"
                shimmer={shimmer}
              />
            </div>

            {/* Columna 5: Accion / Boton menu */}
            <div className="col-span-1 flex items-center justify-end">
              <BaseSkeleton
                className="h-7 w-7 rounded-lg bg-slate-200/40"
                shimmer={shimmer}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Paginador inferior */}
      {showPagination && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 bg-slate-50/40">
          <BaseSkeleton className="h-3 w-28 rounded-full bg-slate-200/50" shimmer={shimmer} />
          <div className="flex items-center gap-1.5">
            <BaseSkeleton className="h-8 w-8 rounded-lg bg-slate-200/40" shimmer={shimmer} />
            <BaseSkeleton className="h-8 w-8 rounded-lg bg-slate-200/40" shimmer={shimmer} />
            <BaseSkeleton className="h-8 w-8 rounded-lg bg-slate-200/40" shimmer={shimmer} />
          </div>
        </div>
      )}
    </div>
  );
}
