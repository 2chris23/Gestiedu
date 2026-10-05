'use client';

import * as React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType, EmblaOptionsType } from 'embla-carousel';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * EL CARRIL — SIGUE AL DEDO, NO SE TELETRANSPORTA
 *
 * ─── POR QUÉ ESTÁ HECHO OTRA VEZ ────────────────────────────────────────────
 *
 * La primera versión la programé a mano: escuchaba el ratón y movía el
 * `scrollLeft` a pelo. Se veía bien en un vídeo y era mala de usar. Dos motivos:
 *
 *   1. **El enganche peleaba con el arrastre.** El CSS tenía
 *      `scroll-snap-type: x mandatory`, así que mientras el dedo arrastraba, el
 *      navegador tiraba en dirección contraria para encajar la tarjeta. Eso es
 *      el "se teletransporta": no es un salto, son dos fuerzas peleándose.
 *
 *   2. **Al soltar no pasaba nada.** Un carrusel de verdad tiene inercia: sigue
 *      corriendo un poco y frena. Sin eso se siente muerto.
 *
 * Ahora lo lleva **Embla**, que es exactamente el motor que usa el carrusel de
 * shadcn/ui. Sigue al puntero píxel a píxel, tiene inercia al soltar, y decide
 * el enganche cuando el dedo ya no está — nunca mientras arrastras.
 *
 * No tenía sentido reescribir eso a mano. Lo hice y salió peor: esta es la
 * corrección.
 *
 * ─── LO QUE SIGUE SIENDO NUESTRO ────────────────────────────────────────────
 *
 *   · la rueda vertical del ratón mueve el carril en horizontal;
 *   · las flechas del teclado, para quien no usa ratón;
 *   · los botones de las esquinas solo salen si hay algo a ese lado;
 *   · arrastrar no dispara el clic de la tarjeta de debajo.
 */

interface Props {
    children: React.ReactNode;
    /** Para quien navega a ciegas. Obligatorio: esto es una lista. */
    etiqueta: string;
    conFlechas?: boolean;
    /** Deja de enganchar y corre libre. Para listas muy largas. */
    libre?: boolean;
    /** Sin fin: al pasar el último vuelve el primero (los accesos del Inicio). */
    bucle?: boolean;
    /**
     * El ancho de cada elemento (clases de Tailwind). Va en la caja de cada
     * uno, no dentro: un `w-[44%]` dentro de una caja que mide lo que su
     * contenido no significa nada.
     */
    anchoDeCada?: string;
    /** El hueco entre elementos (clases de Tailwind). */
    hueco?: string;
    /** Dónde empieza: el horario del día arranca en la hora que va, no en la primera. */
    inicio?: number;
    /** Para quien quiera mover el carril desde fuera (flechas en otra parte). */
    alListo?: (api: EmblaCarouselType) => void;
    className?: string;
}

export function Carril({
    children,
    etiqueta,
    conFlechas = true,
    libre = false,
    bucle = false,
    anchoDeCada,
    hueco = 'gap-3',
    inicio,
    alListo,
    className,
}: Props) {
    const opciones: EmblaOptionsType = {
        align: 'start',
        containScroll: bucle ? false : 'trimSnaps',
        loop: bucle,
        dragFree: libre,
        // Arrastrar tiene que costar lo mismo que empujar la tarjeta: 1 a 1.
        // Por debajo de 1 el dedo "resbala" y se siente barato.
        dragThreshold: 6,
        skipSnaps: false,
    };

    const [refCarril, embla] = useEmblaCarousel({ ...opciones, ...(inicio ? { startIndex: inicio } : {}) });

    React.useEffect(() => {
        if (embla && alListo) alListo(embla);
    }, [embla, alListo]);

    // Si cambia dónde empezar (llega la hora del servidor, se cambia de día),
    // se salta ahí sin animación: no es un desplazamiento que haya pedido nadie.
    React.useEffect(() => {
        if (embla && inicio !== undefined) embla.scrollTo(inicio, true);
    }, [embla, inicio]);
    const [puedeIzquierda, setPuedeIzquierda] = React.useState(false);
    const [puedeDerecha, setPuedeDerecha] = React.useState(false);

    const mirarBordes = React.useCallback(() => {
        if (!embla) return;
        setPuedeIzquierda(embla.canScrollPrev());
        setPuedeDerecha(embla.canScrollNext());
    }, [embla]);

    React.useEffect(() => {
        if (!embla) return;
        mirarBordes();
        embla.on('select', mirarBordes);
        embla.on('reInit', mirarBordes);
        embla.on('scroll', mirarBordes);

        return () => {
            embla.off('select', mirarBordes);
            embla.off('reInit', mirarBordes);
            embla.off('scroll', mirarBordes);
        };
    }, [embla, mirarBordes]);

    /**
     * EL CLIC TRAS UN ARRASTRE LO ANULA EMBLA, NO ESTE ARCHIVO
     *
     * Embla ya se come el clic que llega al soltar un arrastre (pasado su
     * umbral), y deja pasar un toque. Aquí había un freno propio que marcaba
     * «arrastrando» en CUALQUIER pulsación y lo quitaba un instante DESPUÉS
     * del clic: se comía también los toques. Desde que el horario en vivo va
     * en este carril, tocar una clase no abría nada (ALUM-UI-01).
     */

    // La rueda vertical del ratón mueve el carril en horizontal.
    React.useEffect(() => {
        if (!embla) return;
        const nodo = embla.rootNode();
        const conRueda = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            if (!embla.canScrollNext() && !embla.canScrollPrev()) return;
            e.preventDefault();
            if (e.deltaY > 0) embla.scrollNext();
            else embla.scrollPrev();
        };
        nodo.addEventListener('wheel', conRueda, { passive: false });
        return () => nodo.removeEventListener('wheel', conRueda);
    }, [embla]);

    const conTeclado = (e: React.KeyboardEvent) => {
        if (!embla) return;
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            embla.scrollNext();
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            embla.scrollPrev();
        }
    };

    return (
        <div className={cn('relative', className)}>
            <div
                ref={refCarril}
                role="group"
                aria-label={etiqueta}
                tabIndex={0}
                onKeyDown={conTeclado}
                /**
                 * `touch-action: pan-y` reparte los ejes: el horizontal lo
                 * lleva el carril, el vertical se lo queda el navegador. Sin
                 * esto, el navegador no sabe si el dedo quiere mover el carril
                 * o bajar la página, y hace las dos a medias — el carril avanza
                 * mientras la página tiembla.
                 *
                 * `overscroll-behavior: contain` deja que el carril tenga su
                 * propio rebote al llegar al final, pero sin contagiárselo a la
                 * página de detrás.
                 */
                style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
                className="overflow-hidden rounded-lg"
            >
                {/*
                    El carril que se mueve. Embla lo empuja; nosotros solo lo
                    vestimos.

                    `select-none` no es cosmética: sin ella, arrastrar para ver
                    la hora siguiente va **pintando de azul** el texto de las
                    tarjetas por el camino, como cuando se selecciona con el
                    ratón. Queda sucio y encima deja el texto seleccionado al
                    soltar.
                */}
                <div className={cn('flex cursor-grab select-none py-1 active:cursor-grabbing', hueco)}>
                    {React.Children.map(children, (hijo, i) => (
                        <div key={i} className={cn('min-w-0 shrink-0 grow-0', anchoDeCada)}>
                            {hijo}
                        </div>
                    ))}
                </div>
            </div>

            {conFlechas && (
                <>
                    <BotonCarril
                        hacia="izquierda"
                        visible={puedeIzquierda}
                        alPulsar={() => embla?.scrollPrev()}
                    />
                    <BotonCarril
                        hacia="derecha"
                        visible={puedeDerecha}
                        alPulsar={() => embla?.scrollNext()}
                    />
                </>
            )}
        </div>
    );
}

function BotonCarril({
    hacia,
    visible,
    alPulsar,
}: {
    hacia: 'izquierda' | 'derecha';
    visible: boolean;
    alPulsar: () => void;
}) {
    const Flecha = hacia === 'izquierda' ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={alPulsar}
            aria-label={hacia === 'izquierda' ? 'Ver lo anterior' : 'Ver lo siguiente'}
            tabIndex={visible ? 0 : -1}
            aria-hidden={!visible}
            className={cn(
                'absolute top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-pastilla border border-linea bg-tarjeta/90 p-2 text-tinta shadow-2 backdrop-blur transition-all duration-200 ease-suave md:flex',
                'hover:bg-tarjeta hover:shadow-3 active:scale-90',
                hacia === 'izquierda' ? 'left-1.5' : 'right-1.5',
                visible ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
        >
            <Flecha className="h-4 w-4" strokeWidth={2.5} />
        </button>
    );
}
