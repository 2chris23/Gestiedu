import React from 'react';
import { cn } from '@/lib/utils';

export interface BaseSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean;
}

/**
 * Bloque elemental de precarga con animacion de pulsacion suave y soporte de shimmer.
 */
export function BaseSkeleton({
  className,
  shimmer = true,
  ...props
}: BaseSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-md bg-slate-200/70 animate-latir-suave',
        shimmer && 'skeleton-shimmer',
        className
      )}
      {...props}
    />
  );
}
