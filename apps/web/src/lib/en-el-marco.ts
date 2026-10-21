import { useSyncExternalStore } from 'react';

/**
 * ¿ESTA PANTALLA ESTÁ DENTRO DE UN MARCO?
 *
 * La precarga ya no abre pantallas en marcos (baja un paquete, `lib/precarga.ts`)
 * y nadie puede enmarcar la app (`X-Frame-Options: DENY`). Se deja como
 * cinturón: si alguna vez se pinta dentro de un marco, ahí no corre nada de
 * fondo —el tiempo real, la descarga, los avisos, el candado, el recorrido
 * guiado, guardar la memoria—, que ya hace la ventana de verdad.
 */
export function esElRecorridoInvisible(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.self !== window.top;
    } catch {
        // Un marco de otro origen no deja ni mirar: también es un marco.
        return true;
    }
}

const nada = () => () => {};

/** En el servidor y en la primera pintada, `false` (no cambia lo que se hidrata). */
export function useEnElMarco(): boolean {
    return useSyncExternalStore(nada, esElRecorridoInvisible, () => false);
}
