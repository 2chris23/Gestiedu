'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft } from 'lucide-react';

/**
 * EL PANEL DE UNA FICHA (2026-10-15)
 *
 * La ficha de un estudiante o de una persona del personal, con la misma forma
 * que «Nuevo movimiento» (Cristian: «como lo venimos haciendo en ingreso y
 * egreso»): la pantalla entera en el teléfono, la flecha redonda arriba, el
 * contenido que se desplaza y, abajo, la acción que importa.
 */
export function PanelDeFicha({
    titulo,
    subtitulo,
    alCerrar,
    abajo,
    children,
}: {
    titulo: string;
    subtitulo?: string;
    alCerrar: () => void;
    /** La acción de abajo («Registrar pago»), fija. */
    abajo?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <DialogPrimitive.Root open onOpenChange={(v) => !v && alCerrar()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
                <DialogPrimitive.Content
                    aria-describedby={undefined}
                    className="fixed inset-0 z-50 flex flex-col bg-gray-50 pb-[var(--zona-segura-abajo,0px)] pt-[var(--zona-segura-arriba,0px)] outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(54rem,calc(100dvh-2rem))] sm:w-[28rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-3xl sm:pb-0 sm:pt-0 sm:shadow-2xl"
                >
                    <div className="flex items-center gap-3 px-3 py-3">
                        <DialogPrimitive.Close
                            aria-label="Volver"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                        >
                            <ChevronLeft className="h-5 w-5" aria-hidden />
                        </DialogPrimitive.Close>
                        <div className="min-w-0 flex-1">
                            <DialogPrimitive.Title className="truncate text-base font-bold text-gray-900">{titulo}</DialogPrimitive.Title>
                            {subtitulo && <p className="truncate text-sm text-gray-600">{subtitulo}</p>}
                        </div>
                    </div>
                    <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6">{children}</div>
                    {abajo && <div className="border-t border-gray-200/70 bg-gray-50 px-4 py-3">{abajo}</div>}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

/** Un título de sección, pequeño y en gris, como en Configuración. */
export function TituloDeSeccion({ children }: { children: React.ReactNode }) {
    return <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-600">{children}</h3>;
}

export default PanelDeFicha;
