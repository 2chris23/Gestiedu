'use client';

import * as React from 'react';
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { ColumnaAdaptable } from './tabla-adaptable';

export interface TablaVirtualProps<T> {
    datos: T[];
    columnas: ColumnaAdaptable<T>[];
    clave: (fila: T, indice: number) => string;
    cargando?: boolean;
    vacio?: React.ReactNode;
    alPulsar?: (fila: T) => void;
    alturaContenedor?: number;
    alturaFilaEstimada?: number;
    className?: string;
}

const alineacion: Record<string, string> = {
    izquierda: 'text-left justify-start',
    centro: 'text-center justify-center',
    derecha: 'text-right justify-end',
};

export function TablaVirtual<T>({
    datos,
    columnas,
    clave,
    cargando,
    vacio,
    alPulsar,
    alturaContenedor = 540,
    alturaFilaEstimada = 54,
    className,
}: TablaVirtualProps<T>) {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: datos.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => alturaFilaEstimada,
        overscan: 6,
    });

    if (cargando) {
        return (
            <div className={cn('flex items-center justify-center py-16 text-gray-500 text-sm', className)}>
                Cargando registros...
            </div>
        );
    }

    if (datos.length === 0) {
        return (
            <div className={cn('flex items-center justify-center py-16 text-gray-500 text-sm', className)}>
                {vacio ?? 'No hay elementos para mostrar.'}
            </div>
        );
    }

    return (
        <div className={cn('@container w-full rounded-xl border border-linea bg-tarjeta shadow-1 overflow-hidden', className)}>
            <div
                ref={parentRef}
                className="overflow-auto"
                style={{ maxHeight: `${alturaContenedor}px` }}
            >
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="sticky top-0 z-10 border-b border-linea bg-tarjeta shadow-sm">
                        <tr>
                            {columnas.map((col) => (
                                <th
                                    key={col.id}
                                    scope="col"
                                    className={cn(
                                        'px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-tinta-suave bg-tarjeta',
                                        col.ancho,
                                        alineacion[col.alinear ?? 'izquierda'].split(' ')[0]
                                    )}
                                >
                                    {col.titulo}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            position: 'relative',
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const fila = datos[virtualRow.index];
                            const i = virtualRow.index;
                            return (
                                <tr
                                    key={clave(fila, i)}
                                    onClick={alPulsar ? () => alPulsar(fila) : undefined}
                                    className={cn(
                                        'absolute left-0 top-0 flex w-full border-b border-linea/60 transition-colors',
                                        alPulsar && 'cursor-pointer hover:bg-hover'
                                    )}
                                    style={{
                                        transform: `translateY(${virtualRow.start}px)`,
                                        height: `${virtualRow.size}px`,
                                    }}
                                >
                                    {columnas.map((col) => (
                                        <td
                                            key={col.id}
                                            className={cn(
                                                'flex items-center px-5 py-2 text-sm text-tinta',
                                                col.ancho ?? 'flex-1',
                                                alineacion[col.alinear ?? 'izquierda'].split(' ')[0]
                                            )}
                                        >
                                            {col.celda(fila, i)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
