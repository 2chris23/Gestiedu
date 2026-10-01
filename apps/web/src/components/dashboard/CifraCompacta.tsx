'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * UN NÚMERO DEL PANEL, SIN OCUPAR MEDIA PANTALLA
 *
 * Los cuatro números de arriba del panel se pintaban con `DataCard`: `p-6`,
 * el icono en un cuadro de `p-3`, la cifra a `text-3xl` y `gap-6` entre
 * tarjetas. En un ordenador se ven bien, en fila. En un teléfono caen en
 * columna: ~150 px cada una, ~670 px de las 844 que tiene la pantalla. Cuatro
 * cifras ocupaban el teléfono entero y para ver cualquier otra cosa había que
 * bajar dos pantallas.
 *
 * Esta es la misma información en 2 × 2. La tarjeta grande sigue existiendo
 * para donde tiene sentido; esto es para la rejilla de cabecera.
 */

export type ColorDeCifra = 'indigo' | 'menta' | 'coral' | 'ambar' | 'cian' | 'morado';

const COLORES: Record<ColorDeCifra, { borde: string; fondo: string; icono: string }> = {
    indigo: { borde: 'border-l-indigo-500', fondo: 'bg-indigo-50', icono: 'text-indigo-600' },
    menta: { borde: 'border-l-emerald-500', fondo: 'bg-emerald-50', icono: 'text-emerald-600' },
    coral: { borde: 'border-l-red-500', fondo: 'bg-red-50', icono: 'text-red-600' },
    ambar: { borde: 'border-l-amber-500', fondo: 'bg-amber-50', icono: 'text-amber-600' },
    cian: { borde: 'border-l-cyan-500', fondo: 'bg-cyan-50', icono: 'text-cyan-600' },
    morado: { borde: 'border-l-purple-500', fondo: 'bg-purple-50', icono: 'text-purple-600' },
};

export interface CifraCompactaProps {
    titulo: string;
    valor: number | string;
    icono: LucideIcon;
    color?: ColorDeCifra;
    /** La letra pequeña de debajo: el ciclo, «últimos 30 días»… */
    pie?: string;
    cargando?: boolean;
}

export function CifraCompacta({
    titulo,
    valor,
    icono: Icono,
    color = 'indigo',
    pie,
    cargando = false,
}: CifraCompactaProps) {
    const c = COLORES[color];
    return (
        <article className={cn('rounded-xl border border-gray-200 border-l-4 bg-white p-3 shadow-sm sm:p-4', c.borde)}>
            <div className="flex items-start gap-2">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', c.fondo)}>
                    <Icono className={cn('h-4 w-4', c.icono)} aria-hidden />
                </span>
                <p className="min-w-0 pt-0.5 text-xs font-medium leading-tight text-gray-600">{titulo}</p>
            </div>
            {cargando ? (
                <div className="mt-2 h-7 w-16 animate-pulse rounded bg-gray-200" />
            ) : (
                <p className="mt-1.5 text-2xl font-bold leading-none text-gray-900 sm:text-3xl">{valor}</p>
            )}
            {pie && !cargando && <p className="mt-1 truncate text-xs text-gray-500">{pie}</p>}
        </article>
    );
}

/** Las cuatro, en dos columnas en el teléfono y en cuatro en el ordenador. */
export function RejillaDeCifras({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{children}</div>;
}

export default CifraCompacta;
