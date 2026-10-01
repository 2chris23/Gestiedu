'use client';

import * as React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

/**
 * El envoltorio de los globos, para una pantalla con muchos botones de icono
 * seguidos (así el segundo globo sale sin esperar).
 *
 * Ya no va en el armazón: cada `BotonIcono` trae el suyo. Estando arriba del
 * todo, los globos y su posicionador bajaban en TODAS las pantallas —la
 * portada y el login incluidos—, aunque casi ninguna tenga un botón de icono.
 */
export function ProveedorDeGlobos({ children }: { children: React.ReactNode }) {
    return <Tooltip.Provider delayDuration={350}>{children}</Tooltip.Provider>;
}

export default ProveedorDeGlobos;
