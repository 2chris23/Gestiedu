'use client';

import * as React from 'react';
import { EsqueletoDelInicioMovil } from '@/components/dashboard/InicioMovil';

/**
 * El esqueleto del Inicio mientras carga. En el teléfono los cuatro roles
 * tienen ya su Inicio azul (`InicioMovil`): esperar sobre el gris y saltar a
 * azul se veía como un parpadeo. En el ordenador, el de la hoja (`children`).
 */
export function EsqueletoSegunElRol({ children }: { children: React.ReactNode }) {
    return (
        <>
            <EsqueletoDelInicioMovil />
            <div className="hidden lateral:block">{children}</div>
        </>
    );
}
