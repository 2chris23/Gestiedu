import React from 'react';
import { cn } from '@/lib/utils';
import { BaseSkeleton } from './BaseSkeleton';

export interface SkeletonBentoGridProps {
  count?: number;
  className?: string;
  shimmer?: boolean;
}

/**
 * Precarga de la seccion 'IR A' (Accesos directos Bento del panel principal):
 * Calca con exactitud las tarjetas con icono, titulo y descripcion corta (Captura 1).
 */
export function SkeletonBentoGrid({
  count = 8,
  className,
  shimmer = true,
}: SkeletonBentoGridProps) {
  return (
    <section className={cn('mt-6', className)} aria-busy="true">
      <div className="mb-3">
        <BaseSkeleton className="h-4 w-16 rounded-full bg-slate-200/60" shimmer={shimmer} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[92px] flex-col justify-start gap-2.5 rounded-xl border border-gray-100 bg-white p-3 shadow-xs animate-latir-suave"
          >
            {/* Fila superior: Icono en caja + Flecha lateral */}
            <div className="flex items-center justify-between">
              <BaseSkeleton
                className="h-9 w-9 shrink-0 rounded-lg bg-indigo-50/80"
                shimmer={shimmer}
              />
              <BaseSkeleton
                className="h-3 w-3 rounded-full bg-slate-200/40"
                shimmer={shimmer}
              />
            </div>

            {/* Titulo y descripcion/pista */}
            <div className="space-y-1.5 pt-1">
              <BaseSkeleton
                className="h-3.5 w-24 rounded-full bg-slate-200/75"
                shimmer={shimmer}
              />
              <BaseSkeleton
                className="h-2.5 w-36 rounded-full bg-slate-200/40"
                shimmer={shimmer}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
