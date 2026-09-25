'use client';

import * as React from 'react';
import { Sun, Sunset, Clock4 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { elTurno, Turno } from '@/lib/turnos';

/**
 * LA ETIQUETA DEL TURNO
 *
 * Un sol para la mañana, un atardecer para la tarde, un reloj para el integral.
 * Siempre con la palabra al lado: el icono solo no basta, y el color tampoco.
 */
const ICONOS: Record<Turno, React.ComponentType<{ size?: number; className?: string }>> = {
    MANANA: Sun,
    TARDE: Sunset,
    INTEGRAL: Clock4,
};

interface Props {
    turno?: string | null;
    /** `sm` para listas apretadas; `md` para cabeceras. */
    tamano?: 'sm' | 'md';
    /** Solo el icono y el color, sin palabra (para sitios muy estrechos). */
    soloIcono?: boolean;
    className?: string;
}

export function TurnoBadge({ turno, tamano = 'sm', soloIcono = false, className }: Props) {
    const datos = elTurno(turno);
    const Icono = ICONOS[datos.clave];

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap',
                datos.clases,
                tamano === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
                className
            )}
            title={`Turno ${datos.nombre}`}
        >
            <Icono size={tamano === 'sm' ? 12 : 14} className="shrink-0" />
            {soloIcono ? <span className="sr-only">Turno {datos.nombre}</span> : datos.nombre}
        </span>
    );
}

export default TurnoBadge;
