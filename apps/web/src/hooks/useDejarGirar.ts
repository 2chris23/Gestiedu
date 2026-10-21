'use client';

import { useEffect } from 'react';
import { dejarGirar } from '@/lib/girar-la-pantalla';

/**
 * Mientras esta pantalla (o ventana) esté abierta, el teléfono puede girar; al
 * cerrarla, la app vuelve a quedarse de pie. Ver `lib/girar-la-pantalla.ts`.
 */
export function useDejarGirar(activo = true) {
    useEffect(() => {
        if (!activo) return;
        return dejarGirar();
    }, [activo]);
}
