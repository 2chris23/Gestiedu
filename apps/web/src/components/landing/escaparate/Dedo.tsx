'use client';

import * as React from 'react';
import { m } from 'framer-motion';

/**
 * EL DEDO (Y EL CURSOR) QUE NO ES DE NADIE
 *
 * Va a buscar el elemento marcado con `data-blanco="<id>"` dentro de su
 * pantalla y se posa encima. Lo busca por su posición en la maqueta
 * (`offsetLeft/Top` sumados hasta la pantalla), que no cambia con las
 * escalas de fuera: el escaparate puede estar encogido a la mitad y el dedo
 * sigue cayendo en el botón.
 *
 * El toque es una onda que nace donde está el dedo (`toque` cambia → onda
 * nueva). Todo se mueve con `transform` y `opacity`: nada recoloca la página.
 */

export type FormaDelPuntero = 'dedo' | 'cursor';

interface Props {
    /** El elemento al que va. `null`: se retira. */
    blanco: string | null;
    /** Cambia en cada toque: dibuja una onda. */
    toque: number | null;
    forma: FormaDelPuntero;
    /** Tamaño del dedo, en píxeles de la maqueta. */
    tam?: number;
    /** Dónde descansa cuando no toca nada. */
    reposo: { x: number; y: number };
}

function centroDentro(raiz: HTMLElement, el: HTMLElement) {
    let x = el.offsetWidth / 2;
    let y = el.offsetHeight / 2;
    let n: HTMLElement | null = el;
    while (n && n !== raiz) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
    }
    return { x, y };
}

export function Dedo({ blanco, toque, forma, tam = 46, reposo }: Props) {
    const capa = React.useRef<HTMLDivElement>(null);
    const [pos, setPos] = React.useState(reposo);

    React.useLayoutEffect(() => {
        const raiz = capa.current?.parentElement;
        if (!raiz) return;
        if (!blanco) {
            setPos(reposo);
            return;
        }
        const el = raiz.querySelector<HTMLElement>(`[data-blanco="${blanco}"]`);
        if (el) setPos(centroDentro(raiz, el));
        // Si no está (aún no se pintó), se queda donde estaba.
    }, [blanco, reposo]);

    const retirado = !blanco;

    return (
        <div ref={capa} className="pointer-events-none absolute inset-0 z-30" aria-hidden>
            <m.div
                className="absolute left-0 top-0"
                initial={false}
                animate={{ x: pos.x, y: pos.y, opacity: retirado ? 0 : 1 }}
                transition={{ type: 'spring', stiffness: 170, damping: 24, mass: 0.9 }}
            >
                {toque !== null && (
                    <m.span
                        key={toque}
                        className="absolute rounded-full bg-indigo-500/35"
                        style={{ width: tam * 1.6, height: tam * 1.6, left: -tam * 0.8, top: -tam * 0.8 }}
                        initial={{ scale: 0.2, opacity: 0.9 }}
                        animate={{ scale: 1.25, opacity: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                )}
                {forma === 'dedo' ? (
                    <m.span
                        key={`y${toque}`}
                        className="absolute block rounded-full border-2 border-white/90 bg-slate-900/25 shadow-[0_6px_16px_rgba(15,23,42,0.35)]"
                        style={{ width: tam, height: tam, left: -tam / 2, top: -tam / 2 }}
                        // El dedo se hunde un poco al tocar.
                        initial={{ scale: toque === null ? 1 : 0.82 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                    />
                ) : (
                    <svg
                        width={tam * 0.55}
                        height={tam * 0.55 * 1.3}
                        viewBox="0 0 20 26"
                        className="absolute drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]"
                        style={{ left: -2, top: -2 }}
                    >
                        <path
                            d="M2 1.5v19.2l5.1-4.6 3.3 7.4 3.4-1.5-3.3-7.3 6.9-.4z"
                            fill="#0f172a"
                            stroke="#fff"
                            strokeWidth="1.6"
                            strokeLinejoin="round"
                        />
                    </svg>
                )}
            </m.div>
        </div>
    );
}
