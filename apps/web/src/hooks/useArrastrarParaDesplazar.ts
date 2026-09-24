'use client';

import * as React from 'react';

/**
 * ARRASTRAR EL HORARIO CON EL RATÓN
 *
 * En el teléfono el carril del horario se mueve con el dedo, pero en el
 * escritorio no se movía: había que buscar los botones de flecha o la rueda del
 * ratón, y con el carril sin barra visible parecía que la pantalla estaba rota.
 *
 * Aquí se agarra y se arrastra, como un mapa.
 *
 * DOS CUIDADOS:
 *   · un clic es un arrastre de cero píxeles: hasta que no se mueven más de
 *     `MINIMO_PARA_ARRASTRAR`, esto no hace nada y el clic entra normal. Pasado
 *     ese umbral, el clic siguiente se anula (si no, soltar encima de un bloque
 *     abriría la clase sin querer);
 *   · el dedo se deja en paz: el navegador ya lo hace mejor.
 */

const MINIMO_PARA_ARRASTRAR = 6;

export function useArrastrarParaDesplazar<T extends HTMLElement>() {
    const ref = React.useRef<T | null>(null);
    const [arrastrando, setArrastrando] = React.useState(false);

    React.useEffect(() => {
        const nodo = ref.current;
        if (!nodo) return;

        let activo = false;
        let seMovio = false;
        let xInicial = 0;
        let desplazamientoInicial = 0;

        const empezar = (e: PointerEvent) => {
            if (e.pointerType === 'touch' || e.button !== 0) return;
            activo = true;
            seMovio = false;
            xInicial = e.clientX;
            desplazamientoInicial = nodo.scrollLeft;
        };

        const mover = (e: PointerEvent) => {
            if (!activo) return;
            const avance = e.clientX - xInicial;
            if (!seMovio && Math.abs(avance) < MINIMO_PARA_ARRASTRAR) return;
            if (!seMovio) {
                seMovio = true;
                setArrastrando(true);
                nodo.setPointerCapture?.(e.pointerId);
            }
            e.preventDefault();
            nodo.scrollLeft = desplazamientoInicial - avance;
        };

        const soltar = (e: PointerEvent) => {
            if (!activo) return;
            activo = false;
            if (seMovio) {
                // El clic que viene detrás de un arrastre no es un clic.
                const tragarClic = (ev: MouseEvent) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                };
                nodo.addEventListener('click', tragarClic, { capture: true, once: true });
                window.setTimeout(() => nodo.removeEventListener('click', tragarClic, { capture: true }), 0);
                nodo.releasePointerCapture?.(e.pointerId);
            }
            seMovio = false;
            setArrastrando(false);
        };

        nodo.addEventListener('pointerdown', empezar);
        nodo.addEventListener('pointermove', mover);
        nodo.addEventListener('pointerup', soltar);
        nodo.addEventListener('pointercancel', soltar);
        nodo.addEventListener('pointerleave', soltar);

        return () => {
            nodo.removeEventListener('pointerdown', empezar);
            nodo.removeEventListener('pointermove', mover);
            nodo.removeEventListener('pointerup', soltar);
            nodo.removeEventListener('pointercancel', soltar);
            nodo.removeEventListener('pointerleave', soltar);
        };
    }, []);

    return { ref, arrastrando };
}

export default useArrastrarParaDesplazar;
