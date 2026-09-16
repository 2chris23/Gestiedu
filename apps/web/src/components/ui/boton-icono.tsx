'use client';

import * as React from 'react';
import { MorphIcon } from 'morphicons/react';
import type { IconNode } from 'lucide';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/**
 * EL BOTÓN DE ICONO
 *
 * ─── POR QUÉ CASI SIN TEXTO ─────────────────────────────────────────────────
 *
 * Una barra de acciones con «Editar · Eliminar · Ver historial · Exportar» se
 * come media pantalla de teléfono antes de enseñar un solo dato. Los iconos
 * ocupan un cuadrado y se reconocen más rápido que se leen.
 *
 * ─── EL PELIGRO, Y CÓMO SE EVITA ────────────────────────────────────────────
 *
 * Un icono sin texto es una adivinanza si no se cumplen las tres:
 *
 *   1. **Nombre siempre.** `etiqueta` es obligatorio y va al `aria-label`: quien
 *      usa lector de pantalla oye "Eliminar", no "botón".
 *   2. **Globo al posar el ratón**, para quien duda.
 *   3. **Iconos evidentes.** Papelera, lápiz, ojo. Nada de inventos: si hace
 *      falta explicar el icono, ese botón lleva texto y punto.
 *
 * Y lo que NUNCA se queda sin texto: la acción principal de la pantalla, y todo
 * lo que no se puede deshacer si no hay confirmación después.
 *
 * ─── EL MORFISMO ────────────────────────────────────────────────────────────
 *
 * Cuando un botón cambia de estado —ojo/ojo tachado, guardado/sin guardar— el
 * icono **se transforma** en el otro con física de muelle (morphicons). No es
 * adorno: el movimiento cuenta que es el MISMO botón el que cambió, en vez de
 * dos iconos que se sustituyen de golpe y parecen dos botones distintos.
 *
 *   <BotonIcono icono={activo ? EyeOff : Eye} etiqueta="Ver notas" />
 *
 * Los iconos vienen del paquete `lucide` (datos), no de `lucide-react`
 * (componentes): morphicons necesita los puntos del dibujo para interpolarlos.
 */

type Tono = 'normal' | 'suave' | 'peligro' | 'fantasma';

const tonos: Record<Tono, string> = {
    normal: 'border border-linea-fuerte bg-tarjeta text-tinta hover:bg-lienzo-hundido shadow-1',
    suave: 'bg-indigo-claro text-indigo-hondo hover:bg-indigo-suave',
    peligro: 'bg-coral-claro text-coral-hondo hover:bg-coral hover:text-coral-encima',
    fantasma: 'text-tinta-suave hover:bg-lienzo-hundido hover:text-tinta',
};

const medidas = {
    // 44 px: lo que el dedo acierta sin mirar. No bajar en pantallas de uso.
    normal: 'h-11 w-11',
    // 36 px: solo dentro de una fila de tabla en escritorio, con ratón.
    pequeno: 'h-9 w-9',
};

interface Props extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    /** Datos del icono, de `lucide`. Cambiarlo hace que se transforme. */
    icono: IconNode;
    /** Qué hace el botón, en una o dos palabras. Obligatorio. */
    etiqueta: string;
    tono?: Tono;
    medida?: keyof typeof medidas;
    /** Enseñar la etiqueta al lado del icono. Para la acción principal. */
    conTexto?: boolean;
}

export function BotonIcono({
    icono,
    etiqueta,
    tono = 'fantasma',
    medida = 'normal',
    conTexto = false,
    className,
    type,
    ...resto
}: Props) {
    const boton = (
        <button
            type={type ?? 'button'}
            aria-label={etiqueta}
            className={cn(
                'inline-flex shrink-0 items-center justify-center gap-2 rounded-pastilla',
                'transition-all duration-200 ease-suave active:scale-90',
                'disabled:pointer-events-none disabled:opacity-45',
                tonos[tono],
                conTexto ? 'h-11 px-4 text-cuerpo font-semibold' : medidas[medida],
                className
            )}
            {...resto}
        >
            <MorphIcon
                icon={icono}
                size={medida === 'pequeno' && !conTexto ? 16 : 18}
                strokeWidth={2}
                spring="snappy"
                // Quien pidió menos movimiento en su sistema, recibe el cambio
                // seco. El icono correcto llega igual; solo no baila.
                reducedMotion="user"
            />
            {conTexto && etiqueta}
        </button>
    );

    if (conTexto) return boton;

    return (
        <Tooltip.Root delayDuration={350}>
            <Tooltip.Trigger asChild>{boton}</Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content
                    sideOffset={6}
                    className="z-50 rounded-sm bg-tinta px-2.5 py-1.5 text-etiqueta font-medium text-lienzo shadow-3 animate-aparecer"
                >
                    {etiqueta}
                    <Tooltip.Arrow className="fill-tinta" />
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}

/**
 * El envoltorio que necesitan los globos. Va una sola vez, arriba del todo del
 * armazón de la aplicación.
 */
export function ProveedorDeGlobos({ children }: { children: React.ReactNode }) {
    return <Tooltip.Provider delayDuration={350}>{children}</Tooltip.Provider>;
}
