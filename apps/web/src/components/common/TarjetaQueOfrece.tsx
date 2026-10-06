'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

/**
 * LA TARJETA QUE OFRECE ALGO (descargar la app, los avisos, el recorrido)
 *
 * Flota abajo, encima de la barra del teléfono, sin mover nada de la página:
 * metida en la página partía la cabecera azul del Inicio. Una cada vez
 * (`lib/turno-de-ofrecer.ts`).
 */
export function TarjetaQueOfrece({
    etiqueta,
    titulo,
    texto,
    icono,
    children,
    ...resto
}: {
    etiqueta: string;
    titulo: string;
    texto: React.ReactNode;
    icono?: React.ReactNode;
    children: React.ReactNode;
} & Record<`data-${string}`, string>) {
    const [montado, setMontado] = React.useState(false);
    React.useEffect(() => setMontado(true), []);
    if (!montado) return null;
    return createPortal(
        <section
            role="region"
            aria-label={etiqueta}
            {...resto}
            className="fixed inset-x-4 z-[90] mx-auto max-w-sm rounded-2xl bg-gray-900 p-4 text-white shadow-2xl motion-safe:animate-aparecer bottom-[calc(6.5rem+var(--zona-segura-abajo))] lateral:inset-x-auto lateral:right-6 lateral:bottom-6 print:hidden"
        >
            <div className="flex items-start gap-3">
                {icono && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10" aria-hidden>
                        {icono}
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-base font-bold">{titulo}</p>
                    <p className="mt-1 text-sm text-gray-200">{texto}</p>
                </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">{children}</div>
        </section>,
        document.body
    );
}

/** Los dos botones de siempre, con el mismo aspecto en todas las ofertas. */
export const botonSecundario = 'min-h-[44px] rounded-xl px-4 text-sm font-semibold text-gray-200 hover:bg-white/10';
export const botonPrincipal =
    'flex min-h-[44px] items-center rounded-xl bg-white px-4 text-sm font-bold text-gray-900 hover:bg-gray-100 disabled:opacity-60';

export default TarjetaQueOfrece;
