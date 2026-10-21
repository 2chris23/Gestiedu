import React from 'react';
import { BaseSkeleton } from '@/components/ui/skeleton/BaseSkeleton';

/**
 * EL ESQUELETO DEL CICLO, CON LA FORMA DE LA PANTALLA DE VERDAD
 *
 * Copia lo que se pinta después, pieza por pieza, para que nada salte al
 * llegar los datos: la cabecera en UNA línea (volver, el nombre y su estado,
 * el lapso y los tres puntos), el bloque de las cinco cifras (en el teléfono,
 * el promedio grande a la izquierda y las otras cuatro de dos en dos) y los
 * seis años cerrados. Antes enseñaba cuatro tarjetas, unas pestañas y tres
 * acordeones que la pantalla ya no tiene (lo vio Cristian).
 */
function Cifra({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col justify-center gap-1.5 bg-white px-2.5 py-2 sm:px-3 ${className ?? ''}`}>
      <BaseSkeleton className="h-3 w-16 rounded" />
      <BaseSkeleton className="h-5 w-12 rounded" />
      <BaseSkeleton className="h-1.5 w-full rounded-full" />
      <BaseSkeleton className="h-3 w-14 rounded" shimmer={false} />
    </div>
  );
}

export default function CargandoDetalleCiclo() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando ciclo escolar...</span>

      <header>
        {/* Volver · nombre y estado · lapso · tres puntos */}
        <div className="flex items-center gap-2">
          <BaseSkeleton className="h-11 w-11 shrink-0 rounded-full bg-slate-200/50" />
          <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <BaseSkeleton className="h-7 w-32 rounded-lg" />
            <BaseSkeleton className="h-5 w-16 rounded-full bg-slate-200/50" />
          </div>
          <BaseSkeleton className="h-11 w-28 rounded-full" />
          <BaseSkeleton className="h-11 w-11 shrink-0 rounded-full bg-slate-200/50" />
        </div>

        {/* Las cinco cifras, como `AcademicStats` */}
        <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 md:grid-cols-5">
          <Cifra className="row-span-2 md:row-span-1" />
          <Cifra />
          <Cifra />
          <Cifra />
          <Cifra />
        </div>
      </header>

      {/* Los seis años, cerrados, como `GradeAccordion` */}
      <div className="space-y-4">
        {[1, 2, 3, 4, 5, 6].map((g) => (
          <div key={g} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-5">
              <BaseSkeleton className="h-12 w-12 rounded-xl bg-slate-200/50" />
              <div className="space-y-2">
                <BaseSkeleton className="h-5 w-32 rounded" />
                <BaseSkeleton className="h-3.5 w-20 rounded" shimmer={false} />
              </div>
            </div>
            <BaseSkeleton className="h-9 w-9 rounded-full bg-slate-200/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
