'use client';

import { useEffect } from 'react';
import { fijarVertical } from '@/lib/girar-la-pantalla';

/**
 * La app va de pie en el teléfono (Cristian, 16-oct-2026). Solo dejan girar
 * editar el horario y el plan de evaluación (`useDejarGirar`). Ver
 * `lib/girar-la-pantalla.ts`.
 */
export function DePie() {
    useEffect(() => {
        void fijarVertical();
    }, []);
    return null;
}
