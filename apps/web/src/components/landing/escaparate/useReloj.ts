'use client';

import * as React from 'react';
import { PASO_MS } from './guion';

/**
 * EL RELOJ DEL ESCAPARATE: UN NÚMERO QUE SUBE, Y SOLO CUANDO SIRVE
 *
 * Cuenta pasos (`PASO_MS`) mientras `enMarcha` sea verdad, y se para en seco
 * cuando no: fuera de la vista, pestaña escondida, pausado a mano o «menos
 * movimiento». Parado no hay ni un temporizador vivo, así que un teléfono que
 * baja la portada no gasta batería en unos aparatos que no ve.
 *
 * Un `setTimeout` encadenado y no un `setInterval`: al volver de una pestaña
 * dormida, un intervalo recupera de golpe los pasos que se perdió y la
 * animación da un salto.
 */
export function useReloj(enMarcha: boolean, inicial = 0, cada = PASO_MS) {
    const [paso, setPaso] = React.useState(inicial);

    React.useEffect(() => {
        if (!enMarcha) return;
        let id = window.setTimeout(function avanza() {
            setPaso((p) => p + 1);
            id = window.setTimeout(avanza, cada);
        }, cada);
        return () => window.clearTimeout(id);
    }, [enMarcha, cada]);

    return [paso, setPaso] as const;
}

/** ¿Se ve la pestaña? `visibilitychange` la esconde al cambiar de app o de pestaña. */
export function usePestanaVisible() {
    const [visible, setVisible] = React.useState(true);
    React.useEffect(() => {
        const mira = () => setVisible(document.visibilityState !== 'hidden');
        mira();
        document.addEventListener('visibilitychange', mira);
        return () => document.removeEventListener('visibilitychange', mira);
    }, []);
    return visible;
}

/**
 * ¿Está a la vista? IntersectionObserver, con un margen: basta con que asome
 * un 15 % para arrancar, y se para en cuanto sale del todo.
 */
export function useALaVista<T extends Element>(ref: React.RefObject<T | null>) {
    const [aLaVista, setALaVista] = React.useState(false);
    React.useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            setALaVista(true);
            return;
        }
        const io = new IntersectionObserver(([e]) => setALaVista(e.isIntersecting), { threshold: 0.15 });
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return aLaVista;
}
