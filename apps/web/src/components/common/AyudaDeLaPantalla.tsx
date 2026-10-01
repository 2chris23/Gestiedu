'use client';

import * as React from 'react';
import { HelpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * «¿CÓMO FUNCIONA?»: LA AYUDA DE UNA PANTALLA (2026-10-01)
 *
 * Cristian pidió que «el usuario sepa qué hace cada cosa». Las pantallas
 * sencillas lo dicen en la línea bajo el título; las que tienen un flujo
 * (la clase en vivo, el plan de evaluación, la configuración, las finanzas)
 * llevan además este botón, siempre con texto, que abre los pasos en orden.
 *
 * Es el mismo botón en el mismo sitio de cada pantalla (`consistent-help`,
 * WCAG 2.2), y se cierra con Escape o tocando fuera.
 */

export interface PasoDeAyuda {
    titulo: string;
    texto: React.ReactNode;
}

export function AyudaDeLaPantalla({
    titulo,
    pasos,
    nota,
    className,
}: {
    /** De qué es la ayuda: «Cómo funciona la clase en vivo». */
    titulo: string;
    pasos: PasoDeAyuda[];
    /** Lo que conviene saber además (una línea al pie). */
    nota?: React.ReactNode;
    className?: string;
}) {
    const [abierta, setAbierta] = React.useState(false);
    return (
        <>
            <button
                type="button"
                onClick={() => setAbierta(true)}
                className={cn(
                    'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50',
                    className
                )}
            >
                <HelpCircle className="h-4 w-4 text-indigo-600" aria-hidden />
                ¿Cómo funciona?
            </button>
            {abierta && (
                <Dialog open onOpenChange={setAbierta}>
                    <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-2xl">
                        <DialogHeader>
                            <DialogTitle>{titulo}</DialogTitle>
                            <DialogDescription>Paso a paso, en el orden en que se hace.</DialogDescription>
                        </DialogHeader>
                        <ol className="space-y-3">
                            {pasos.map((p, i) => (
                                <li key={p.titulo} className="flex gap-3">
                                    <span
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-800"
                                        aria-hidden
                                    >
                                        {i + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-900">{p.titulo}</p>
                                        <p className="text-sm leading-relaxed text-gray-700">{p.texto}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                        {nota && <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{nota}</p>}
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}

export default AyudaDeLaPantalla;
