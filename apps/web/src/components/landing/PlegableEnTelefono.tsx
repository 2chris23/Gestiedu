'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * EN UN TELÉFONO, LO PRIMERO Y UN «VER MÁS»
 *
 * En 390 px las ocho tarjetas de «Qué resuelve» medían 2.800 px: la tercera
 * parte de la portada, y lo que viene detrás (para quién, cómo se empieza,
 * preguntas) quedaba a muchos pulgares de distancia. En el teléfono se ven
 * las primeras y el resto queda detrás de un botón; desde `sm` salen todas.
 *
 * El texto escondido sigue en el HTML (lo lee el buscador y se imprime): lo
 * que lo esconde es una clase, no dejar de pintarlo. Cada elemento que se
 * pliega lleva `hidden sm:flex group-data-[abierto=true]:flex`, y aquí solo se
 * cambia `data-abierto`. No se usa `max-sm:`: con la pantalla `lateral` (una
 * regla `raw`) Tailwind 3 apaga las variantes `max-*`.
 */
export function PlegableEnTelefono({
    id,
    escondidos,
    children,
    className,
}: {
    id: string;
    /** Cuántos quedan detrás del botón, para decirlo en el botón. */
    escondidos: number;
    children: React.ReactNode;
    className?: string;
}) {
    const [abierto, setAbierto] = React.useState(false);
    return (
        <div className="group" data-abierto={abierto}>
            <ul id={id} className={className}>
                {children}
            </ul>
            <div className="mt-6 flex justify-center sm:hidden">
                <button
                    type="button"
                    aria-expanded={abierto}
                    aria-controls={id}
                    onClick={() => setAbierto((a) => !a)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
                >
                    {abierto ? 'Ver menos' : `Ver ${escondidos} más`}
                    <ChevronDown
                        className="h-4 w-4 transition-transform duration-200 group-data-[abierto=true]:rotate-180 motion-reduce:transition-none"
                        aria-hidden
                    />
                </button>
            </div>
        </div>
    );
}
