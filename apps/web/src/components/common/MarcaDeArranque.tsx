'use client';

import { useEffect } from 'react';

declare global {
    interface Window {
        __gestieduArranco?: boolean;
    }
}

/**
 * «YA ARRANQUÉ»: lo que mira el guardián del arranque (`lib/guardian-del-arranque.ts`).
 *
 * Si la app no llega a montar esto, el guardián sabe que la página se quedó
 * en blanco y, sin servidor, lleva a la pantalla de sin conexión.
 */
export function MarcaDeArranque() {
    useEffect(() => {
        window.__gestieduArranco = true;
    }, []);
    return null;
}

export default MarcaDeArranque;
