import React from 'react';
import { EsqueletoSegunElRol } from '@/components/dashboard/EsqueletoSegunElRol';

/**
 * EL INICIO MIENTRAS CARGA
 *
 * En el teléfono, el azul de `InicioMovil` (`EsqueletoSegunElRol`). En el
 * ordenador, las cifras esperan arriba, sobre el azul (`FranjaDelInicio`
 * tiene su propio esqueleto); aquí solo las dos tarjetas de la hoja, con la
 * forma de las de verdad para que nada salte al llegar.
 */
export default function CargandoDashboard() {
    return (
        <EsqueletoSegunElRol>
            <CargandoDashboardDeSiempre />
        </EsqueletoSegunElRol>
    );
}

const TARJETA = 'rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(13,71,161,0.06),0_8px_24px_rgba(13,71,161,0.05)]';
const BARRA = 'rounded-full bg-slate-200/70 motion-safe:animate-latir';

export function CargandoDashboardDeSiempre() {
    return (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]" aria-busy="true" aria-live="polite">
            <span className="sr-only">Cargando el panel…</span>
            {[0, 1].map((t) => (
                <div key={t} className={`${TARJETA} flex flex-col gap-5`}>
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-[14px] bg-slate-100 motion-safe:animate-latir" />
                        <div className="flex flex-col gap-2">
                            <div className={`h-4 w-40 ${BARRA}`} />
                            <div className={`h-3 w-28 ${BARRA}`} />
                        </div>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: 28 }, (_, i) => (
                            <div key={i} className="h-9 rounded-xl bg-slate-100 motion-safe:animate-latir" />
                        ))}
                    </div>
                    <div className="h-16 rounded-[20px] bg-[var(--acento-suave)] motion-safe:animate-latir" />
                </div>
            ))}
        </div>
    );
}
