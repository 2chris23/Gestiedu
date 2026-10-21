'use client';

import * as React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';

/**
 * LAS FILAS Y LAS LISTAS DE FINANZAS (2026-10-14)
 *
 * Una regla para todo Finanzas: **ninguna lista enseña más de 20 filas de
 * golpe**. Con 599 alumnos o 30 profesores la pantalla no se acababa nunca
 * (Cristian). Lo largo se agrupa (año → sección) o se corta con «Ver más».
 *
 * La fila es la de Rial: el avatar, el nombre con su detalle en gris debajo y
 * a la derecha lo que importa (lo que debe, en rojo; o una marca).
 */

export const DE_A_POCO = 20;

export function FilaDeAlumno({
    nombre,
    detalle,
    avatar,
    monto,
    alDia,
    alTocar,
}: {
    nombre: string;
    detalle?: string;
    avatar?: string | null;
    /** Lo que debe; va en rojo. */
    monto?: string;
    /** Sin deuda: una marca verde. */
    alDia?: string;
    alTocar: () => void;
}) {
    return (
        <li>
            <button type="button" onClick={alTocar} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-gray-100">
                <UserAvatar name={nombre.split(', ').reverse().join(' ')} src={avatar ?? undefined} className="h-9 w-9" initialsClassName="text-xs" />
                <span className="min-w-0 flex-1">
                    <span className="block break-words text-[15px] text-gray-900">{nombre}</span>
                    {detalle && <span className="block text-sm text-gray-600">{detalle}</span>}
                </span>
                {monto ? (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-red-700">{monto}</span>
                ) : alDia ? (
                    <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-700">
                        <Check className="h-4 w-4" aria-hidden />
                        {alDia}
                    </span>
                ) : null}
            </button>
        </li>
    );
}

/** Una fila que lleva a otro nivel (un año, una sección): nombre, cifras y chevron. */
export function FilaDeGrupo({
    nombre,
    cuantos,
    deben,
    alTocar,
}: {
    nombre: string;
    cuantos: number;
    deben: number;
    alTocar: () => void;
}) {
    return (
        <li>
            <button type="button" onClick={alTocar} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-gray-100">
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-gray-900">{nombre}</span>
                    <span className="block text-sm text-gray-600">{cuantos} estudiantes</span>
                </span>
                {deben > 0 && <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{deben} deben</span>}
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
            </button>
        </li>
    );
}

/** La lista cortada: las primeras 20 y «Ver N más» (de 20 en 20). */
export function VerMas<T>({
    cosas,
    children,
    vacio,
    etiqueta,
    className,
}: {
    cosas: T[];
    children: (cosa: T) => React.ReactNode;
    vacio?: string;
    etiqueta?: string;
    className?: string;
}) {
    const [cuantas, setCuantas] = React.useState(DE_A_POCO);
    React.useEffect(() => setCuantas(DE_A_POCO), [cosas.length]);
    if (cosas.length === 0) return vacio ? <p className="px-4 py-6 text-center text-sm text-gray-600">{vacio}</p> : null;
    const resto = cosas.length - cuantas;
    return (
        <>
            <ul aria-label={etiqueta} className={cn('divide-y divide-gray-100', className)}>
                {cosas.slice(0, cuantas).map(children)}
            </ul>
            {resto > 0 && (
                <button
                    type="button"
                    onClick={() => setCuantas((n) => n + DE_A_POCO)}
                    className="flex min-h-[48px] w-full items-center justify-center border-t border-gray-100 text-sm font-semibold text-indigo-700 active:bg-gray-50"
                >
                    Ver {Math.min(resto, DE_A_POCO)} más <span className="ml-1 font-normal text-gray-500">de {resto}</span>
                </button>
            )}
        </>
    );
}
