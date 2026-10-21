'use client';

import { useEffect } from 'react';
import { seguirAlSistema } from '@/lib/modo-de-la-app';

/**
 * Con «Como el teléfono», la app se oscurece o se aclara cuando el teléfono
 * lo hace (de noche, por ejemplo), sin tener que volver a abrirla. Lo de antes
 * de pintar lo hace el guion del `<head>` (`MODO_ANTES_DE_PINTAR`).
 */
export function SeguirElModo() {
    useEffect(() => seguirAlSistema(), []);
    return null;
}
