import React from 'react';
import { BaseSkeleton, SkeletonKPI } from '@/components/ui/skeleton';

/**
 * Precarga de alta fidelidad del panel principal (Dashboard):
 * - Cabecera idéntica con título y pastilla de fecha (CLS = 0).
 * - 4 tarjetas KPI con acentos de color y dimensiones reales.
 * - 2 Widgets Principales al 50% con alturas y siluetas idénticas (CLS = 0):
 *   1. Columna Izquierda: Calendario y Actividades (mini calendario mensual con días y panel de agenda).
 *   2. Columna Derecha: Cuadro de Honor Institucional (podio de 5 estudiantes con desglose).
 * - Animación uniforme 'animate-latir-suave' y 'skeleton-shimmer'.
 */
export default function CargandoDashboard() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando panel de control...</span>

      {/* 1. Cabecera: Título y Fecha */}
      <div className="flex items-center justify-between gap-3">
        <BaseSkeleton className="h-8 w-24 rounded-lg bg-slate-200/80" />
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-xs">
          <BaseSkeleton className="h-4 w-4 rounded-full bg-slate-200/60" />
          <BaseSkeleton className="h-4 w-36 rounded-full bg-slate-200/70" />
        </div>
      </div>

      {/* 2. Las 4 tarjetas de cifras superiores */}
      <SkeletonKPI count={4} />

      {/* 3. Rejilla de 2 Widgets Ejecutivos al 50% (CLS = 0) */}
      <section aria-label="Cargando widgets del panel" className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-start">
          {/* Esqueleto Widget 1: Calendario y Actividades */}
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            {/* Cabecera: Fecha actual y pastilla de Lapso */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <BaseSkeleton className="h-9 w-9 rounded-xl bg-violet-100/70 shrink-0" />
                <div className="space-y-1">
                  <BaseSkeleton className="h-4 w-44 rounded bg-slate-200/80" />
                  <BaseSkeleton className="h-3 w-32 rounded bg-slate-100" />
                </div>
              </div>
              <BaseSkeleton className="h-6 w-24 rounded-full bg-violet-100/70" />
            </div>

            {/* Contenido: Calendario completo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-2">
                  <BaseSkeleton className="h-4 w-28 rounded bg-slate-200/80" />
                  <BaseSkeleton className="h-3 w-12 rounded bg-violet-100" />
                </div>
                <div className="flex items-center gap-1">
                  <BaseSkeleton className="h-6 w-6 rounded-md bg-white border border-gray-200" />
                  <BaseSkeleton className="h-6 w-6 rounded-md bg-white border border-gray-200" />
                </div>
              </div>

              {/* Días semana */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {[...Array(7)].map((_, i) => (
                  <BaseSkeleton key={i} className="h-3 w-full rounded bg-slate-200/50" />
                ))}
              </div>

              {/* Rejilla de días 7x5 */}
              <div className="grid grid-cols-7 gap-1">
                {[...Array(35)].map((_, i) => (
                  <BaseSkeleton key={i} className="h-8 w-full rounded-lg bg-slate-100" />
                ))}
              </div>
            </div>

            {/* Actividades del día abajo */}
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-gray-200/60 pb-1.5">
                <BaseSkeleton className="h-4 w-36 rounded bg-slate-200/80" />
                <BaseSkeleton className="h-4 w-10 rounded-full bg-violet-100/60" />
              </div>
              <div className="py-2 text-center">
                <BaseSkeleton className="h-4 w-48 rounded bg-slate-200/60 mx-auto" />
              </div>
            </div>
          </div>

          {/* Esqueleto Widget 2: Cuadro de Honor (Podio Top 3 + Puestos 4 y 5) */}
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <BaseSkeleton className="h-9 w-9 rounded-xl bg-amber-100/70" />
                <div className="space-y-1">
                  <BaseSkeleton className="h-4 w-44 rounded bg-slate-200/80" />
                  <BaseSkeleton className="h-3 w-48 rounded bg-slate-100" />
                </div>
              </div>
              <BaseSkeleton className="h-5 w-24 rounded-full bg-amber-100/60" />
            </div>

            {/* Contenido: Podio y 2 filas */}
            <div className="space-y-3">
              {/* Podio Top 3 */}
              <div className="grid grid-cols-3 gap-2.5 items-end pt-3 pb-1">
                {/* 2.° Plata */}
                <div className="flex flex-col items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/40 p-2.5 min-h-[160px]">
                  <BaseSkeleton className="h-4 w-16 rounded-full bg-slate-200/70" />
                  <BaseSkeleton className="h-10 w-10 rounded-full bg-slate-200/80 my-1" />
                  <div className="w-full space-y-1">
                    <BaseSkeleton className="h-3 w-16 mx-auto rounded bg-slate-200/80" />
                    <BaseSkeleton className="h-2.5 w-12 mx-auto rounded bg-slate-100" />
                  </div>
                  <BaseSkeleton className="h-4 w-14 rounded-full bg-slate-200/70 mt-1" />
                </div>

                {/* 1.° Oro (Centro, más alto) */}
                <div className="relative flex flex-col items-center justify-between rounded-2xl border-2 border-amber-200 bg-amber-50/30 p-3 min-h-[178px]">
                  <BaseSkeleton className="h-4 w-16 rounded-full bg-amber-200/80 mt-1" />
                  <BaseSkeleton className="h-11 w-11 rounded-full bg-amber-200/90 my-1" />
                  <div className="w-full space-y-1">
                    <BaseSkeleton className="h-3.5 w-20 mx-auto rounded bg-slate-200/80" />
                    <BaseSkeleton className="h-2.5 w-14 mx-auto rounded bg-slate-100" />
                  </div>
                  <BaseSkeleton className="h-5 w-16 rounded-full bg-amber-200/80 mt-1" />
                </div>

                {/* 3.° Bronce */}
                <div className="flex flex-col items-center justify-between rounded-2xl border border-orange-200 bg-orange-50/40 p-2.5 min-h-[152px]">
                  <BaseSkeleton className="h-4 w-16 rounded-full bg-orange-200/70" />
                  <BaseSkeleton className="h-9 w-9 rounded-full bg-orange-200/80 my-1" />
                  <div className="w-full space-y-1">
                    <BaseSkeleton className="h-3 w-16 mx-auto rounded bg-slate-200/80" />
                    <BaseSkeleton className="h-2.5 w-12 mx-auto rounded bg-slate-100" />
                  </div>
                  <BaseSkeleton className="h-4 w-14 rounded-full bg-orange-200/70 mt-1" />
                </div>
              </div>

              {/* Filas 4 y 5 */}
              <div className="space-y-1.5 pt-1">
                {[...Array(2)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2.5 rounded-xl border border-gray-100 bg-gray-50/50 p-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BaseSkeleton className="h-6 w-6 rounded-full bg-slate-200/70 shrink-0" />
                      <BaseSkeleton className="h-6 w-6 rounded-full bg-indigo-100 shrink-0" />
                      <div className="space-y-1">
                        <BaseSkeleton className="h-3 w-28 rounded bg-slate-200/80" />
                        <BaseSkeleton className="h-2.5 w-16 rounded bg-slate-100" />
                      </div>
                    </div>
                    <BaseSkeleton className="h-4 w-14 rounded bg-slate-200/70" />
                  </div>
                ))}
              </div>
            </div>

            {/* Pie de fórmula */}
            <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
              <BaseSkeleton className="h-3 w-56 rounded bg-slate-200/70" />
              <BaseSkeleton className="h-3 w-20 rounded bg-slate-200/70" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
