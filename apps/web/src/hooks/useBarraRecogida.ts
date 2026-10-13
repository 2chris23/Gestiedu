'use client';

import { useSyncExternalStore } from 'react';
import { CAMBIO_DE_LATERAL, estaRecogida } from '@/lib/barra-lateral';

function suscribir(avisar: () => void): () => void {
    window.addEventListener(CAMBIO_DE_LATERAL, avisar);
    return () => window.removeEventListener(CAMBIO_DE_LATERAL, avisar);
}

/** La barra lateral del ordenador, recogida o no. En el servidor (y en la primera pintada), abierta. */
export function useBarraRecogida(): boolean {
    return useSyncExternalStore(suscribir, estaRecogida, () => false);
}
