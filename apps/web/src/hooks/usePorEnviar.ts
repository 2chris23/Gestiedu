'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { alCambiarLaCola, laColaEnMemoria, type CambioPendiente } from '@/lib/por-enviar';

const nada: CambioPendiente[] = [];

/** La cola de lo que espera para subir, al día (`lib/por-enviar.ts`). */
export function usePorEnviar(): CambioPendiente[] {
    return useSyncExternalStore(alCambiarLaCola, laColaEnMemoria, () => nada);
}

/**
 * Lo que espera de UN objeto («clase|<sección>|<materia>|<día>»,
 * «actividad|<id>»…), para enseñarlo encima de lo que dice el servidor: un
 * refresco no lo tapa, y cada casilla lleva su relojito hasta que llega.
 */
export function usePendientesDe(prefijo: string | null): CambioPendiente[] {
    const cola = usePorEnviar();
    return useMemo(() => (prefijo ? cola.filter((c) => c.objeto === prefijo || c.objeto.startsWith(`${prefijo}|`)) : nada), [cola, prefijo]);
}
