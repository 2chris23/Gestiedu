import React from 'react';
import { cn } from '@/lib/utils';
import { BaseSkeleton } from './BaseSkeleton';

export interface SkeletonCardProps {
  count?: number;
  className?: string;
  cardClassName?: string;
  hasBottomPills?: boolean;
  shimmer?: boolean;
}

/**
 * Tarjeta de precarga que reproduce exactamente el diseno de referencia (Captura 2):
 * - Esquinas muy redondeadas (rounded-3xl) y fondo blanco con borde suave.
 * - Avatar circular en la esquina superior izquierda con lineas de titulo y subtitulo.
 * - Cuerpo espacioso y limpio.
 * - Pastillas horizontales inferiores de estado.
 */
export function SkeletonCard({
  count = 2,
  className,
  cardClassName,
  hasBottomPills = true,
  shimmer = true,
}: SkeletonCardProps) {
  return (
    <div
      className={cn('space-y-4', className)}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando informacion...</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-3xl border border-slate-100 bg-white p-6 shadow-xs animate-latir-suave',
            cardClassName
          )}
        >
          {/* Cabecera: Avatar circular + Titulo y Subtitulo */}
          <div className="flex items-center gap-3">
            <BaseSkeleton
              className="h-11 w-11 shrink-0 rounded-full bg-slate-200/70"
              shimmer={shimmer}
            />
            <div className="space-y-2">
              <BaseSkeleton
                className="h-3.5 w-32 rounded-full bg-slate-200/80"
                shimmer={shimmer}
              />
              <BaseSkeleton
                className="h-2.5 w-44 rounded-full bg-slate-200/40"
                shimmer={shimmer}
              />
            </div>
          </div>

          {/* Cuerpo espacioso central */}
          <div className="my-6 min-h-[90px] w-full" />

          {/* Pie de tarjeta con 3 pastillas de datos inferiores */}
          {hasBottomPills && (
            <div className="flex items-center justify-around border-t border-slate-100/70 pt-4">
              <BaseSkeleton
                className="h-3 w-20 rounded-full bg-slate-200/50"
                shimmer={shimmer}
              />
              <BaseSkeleton
                className="h-3 w-20 rounded-full bg-slate-200/50"
                shimmer={shimmer}
              />
              <BaseSkeleton
                className="h-3 w-20 rounded-full bg-slate-200/50"
                shimmer={shimmer}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
