'use client';

import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * UNA LISTA PARA ELEGIR, CON LA CARA DE LA APP
 *
 * El `<select>` del navegador en Android abre una ventana negra a pantalla
 * entera con letra enorme, que no se parece a nada del resto; el dueño pidió
 * cambiarlo. Esta se abre pegada al botón, con los colores de la app y cada
 * opción de un dedo de alto (44 px).
 *
 * Mismo uso que un `<select>` controlado: `valor` y `alCambiar`, con las
 * opciones como texto. Los valores van como texto (Radix no acepta números ni
 * el texto vacío).
 */

export interface OpcionDeLista {
    valor: string;
    texto: React.ReactNode;
}

interface Props {
    valor: string;
    alCambiar: (valor: string) => void;
    opciones: OpcionDeLista[];
    /** Para quien no ve la pantalla (y para las pruebas). */
    etiqueta: string;
    id?: string;
    /** `chica`: dentro de una fila, junto a otras cosas. */
    tamano?: 'normal' | 'chica';
    className?: string;
    disabled?: boolean;
}

export function Lista({ valor, alCambiar, opciones, etiqueta, id, tamano = 'normal', className, disabled }: Props) {
    return (
        <Select value={valor} onValueChange={alCambiar} disabled={disabled}>
            <SelectTrigger
                id={id}
                aria-label={etiqueta}
                className={cn(
                    'h-auto gap-1.5 rounded-xl border-gray-200 bg-white font-semibold text-gray-800 shadow-2xs focus:ring-2 focus:ring-indigo-500',
                    tamano === 'chica' ? 'min-h-[36px] w-auto px-2.5 text-xs' : 'min-h-[44px] w-full px-3 text-sm',
                    className
                )}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72 min-w-[10rem] rounded-xl border-gray-200 bg-white p-1 shadow-lg">
                {opciones.map((o) => (
                    <SelectItem
                        key={o.valor}
                        value={o.valor}
                        className="min-h-[44px] rounded-lg text-sm font-semibold text-gray-800 focus:bg-indigo-50 focus:text-indigo-800"
                    >
                        {o.texto}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export default Lista;
