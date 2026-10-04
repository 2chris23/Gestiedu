import React from 'react';
import { cn } from '@/lib/utils';
import { BaseSkeleton } from './BaseSkeleton';

export interface SkeletonKPIProps {
  count?: number;
  className?: string;
  shimmer?: boolean;
}

const ACCENT_BORDERS = [
  'border-l-indigo-400',
  'border-l-emerald-400',
  'border-l-amber-400',
  'border-l-purple-400',
];

/**
 * Precarga de las tarjetas métricas del panel principal (Captura 1):
 * Mantiene idénticas dimensiones que CifraCompacta para un cambio suave sin brincos (CLS = 0).
 */
export function SkeletonKPI({
  count = 4,
  className,
  shimmer = true,
}: SkeletonKPIProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4',
        className
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando métricas principales...</span>
      {Array.from({ length: count }).map((_, i) => (
        <article
          key={i}
          className={cn(
            'rounded-xl border border-gray-100 border-l-4 bg-white p-3 shadow-xs sm:p-4 animate-latir-suave',
            ACCENT_BORDERS[i % ACCENT_BORDERS.length]
          )}
        >
          {/* Fila superior: Icono en caja + Titulo */}
          <div className="flex items-start gap-2.5">
            <BaseSkeleton
              className="h-8 w-8 shrink-0 rounded-lg bg-slate-200/60"
              shimmer={shimmer}
            />
            <div className="min-w-0 pt-1 flex-1">
              <BaseSkeleton
                className="h-3 w-24 rounded-full bg-slate-200/70"
                shimmer={shimmer}
              />
            </div>
          </div>

          {/* Cifra grande numérica */}
          <div className="mt-3">
            <BaseSkeleton
              className="h-7 w-20 rounded-md bg-slate-200/80"
              shimmer={shimmer}
            />
          </div>

          {/* Subtítulo / Pie pequeño (ej. 2026-2027 o Últimos 30 días) */}
          <div className="mt-2">
            <BaseSkeleton
              className="h-2.5 w-28 rounded-full bg-slate-200/40"
              shimmer={shimmer}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
