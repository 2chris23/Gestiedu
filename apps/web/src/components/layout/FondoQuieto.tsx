'use client';

import { useEffect } from 'react';

/**
 * CON UNA VENTANA ABIERTA, LO DE DETRÁS NO SE MUEVE
 *
 * Las ventanas propias de la app (`fixed inset-0` con `aria-modal`) no
 * bloqueaban el fondo: al pasar el dedo por la ventana se movía la pantalla de
 * detrás. Las de Radix sí lo hacen; estas eran medio centenar escritas a mano.
 * Aquí se mira, para todas a la vez, si hay alguna abierta, y mientras la hay
 * la página no se desplaza.
 */
export default function FondoQuieto() {
    useEffect(() => {
        const raiz = document.documentElement;
        const hayVentana = () =>
            Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).some(
                (v) => getComputedStyle(v).position === 'fixed' && v.getBoundingClientRect().height > 0
            );
        let bloqueado = false;
        const mirar = () => {
            const toca = hayVentana();
            if (toca === bloqueado) return;
            bloqueado = toca;
            raiz.style.overflow = toca ? 'hidden' : '';
            document.body.style.overflow = toca ? 'hidden' : '';
            raiz.style.overscrollBehavior = toca ? 'none' : '';
        };
        const vigia = new MutationObserver(mirar);
        vigia.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'class', 'style'] });
        mirar();
        return () => {
            vigia.disconnect();
            raiz.style.overflow = '';
            document.body.style.overflow = '';
            raiz.style.overscrollBehavior = '';
        };
    }, []);
    return null;
}
