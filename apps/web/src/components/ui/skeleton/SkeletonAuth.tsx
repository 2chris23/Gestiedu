import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { BaseSkeleton } from './BaseSkeleton';

export interface SkeletonAuthProps {
  className?: string;
  shimmer?: boolean;
}

/**
 * Precarga de pantallas de autenticacion (inicio de sesion, validacion de instituto).
 * Calca con exactitud geometrica milimetrica la estructura de LoginPage para lograr CLS = 0.
 */
export function SkeletonAuth({
  className,
  shimmer = true,
}: SkeletonAuthProps) {
  return (
    <div
      className={cn(
        'alto-util zona-segura-arriba zona-segura-abajo flex flex-col justify-center bg-gray-50 px-4 py-8 sm:px-6',
        className
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando inicio de sesion...</span>
      <div className="mx-auto w-full max-w-md">
        {/* El liceo: su escudo y su nombre */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-20 w-full items-center justify-center">
            <BaseSkeleton
              className="h-16 w-14 rounded-xl bg-slate-200/70"
              shimmer={shimmer}
            />
          </div>

          <div className="mt-4 flex h-8 items-center justify-center sm:h-9">
            <BaseSkeleton
              className="h-8 w-60 rounded-lg bg-slate-200/80 sm:h-9"
              shimmer={shimmer}
            />
          </div>
          <div className="mt-1 flex h-5 items-center justify-center">
            <BaseSkeleton
              className="h-4 w-44 rounded-md bg-slate-200/50"
              shimmer={shimmer}
            />
          </div>
        </div>

        {/* Tarjeta del Formulario de Acceso (identica a Card de page.tsx) */}
        <Card className="rounded-2xl px-5 py-6 shadow-sm sm:px-8 sm:py-8">
          <div className="space-y-5">
            {/* Campo 1: Correo Electronico */}
            <div>
              <div className="mb-1 flex h-5 items-center">
                <BaseSkeleton className="h-4 w-32 rounded bg-slate-200/60" shimmer={shimmer} />
              </div>
              <BaseSkeleton className="h-12 w-full rounded-md border border-gray-200 bg-slate-100" shimmer={shimmer} />
            </div>

            {/* Campo 2: Contrasena */}
            <div>
              <div className="mb-1 flex h-5 items-center">
                <BaseSkeleton className="h-4 w-24 rounded bg-slate-200/60" shimmer={shimmer} />
              </div>
              <BaseSkeleton className="h-12 w-full rounded-md border border-gray-200 bg-slate-100" shimmer={shimmer} />
            </div>

            {/* Mantener sesion iniciada */}
            <div className="flex min-h-[44px] items-center gap-2.5">
              <BaseSkeleton className="h-5 w-5 rounded border border-gray-300 bg-slate-200/60" shimmer={shimmer} />
              <BaseSkeleton className="h-4 w-44 rounded bg-slate-200/50" shimmer={shimmer} />
            </div>

            {/* Boton Principal de Acceso (rounded-pastilla h-12) */}
            <BaseSkeleton
              className="flex h-12 w-full rounded-pastilla bg-indigo-200/70"
              shimmer={shimmer}
            />
          </div>
        </Card>

        {/* Pie: Powered by GestiEdu */}
        <div className="mt-6 flex h-4 items-center justify-center">
          <BaseSkeleton className="h-3 w-32 rounded bg-slate-200/40" shimmer={shimmer} />
        </div>
      </div>
    </div>
  );
}

export default SkeletonAuth;
