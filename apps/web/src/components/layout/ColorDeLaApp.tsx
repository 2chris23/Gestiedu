'use client';

import * as React from 'react';
import { Check, Moon, Palette, Smartphone, Sun } from 'lucide-react';
import { ACENTOS, ACENTO_POR_DEFECTO, acentoGuardado, elegirAcento, type Acento } from '@/lib/tema-de-la-app';
import { MODOS, MODO_POR_DEFECTO, elegirModo, modoGuardado, type Modo } from '@/lib/modo-de-la-app';
import { cn } from '@/lib/utils';

/**
 * «COLOR DE LA APP», EN MI CUENTA
 *
 * Los cinco colores (Azul, el de siempre; Turquesa, Violeta, Amarillo, Coral)
 * en círculos de 44 px, y debajo el modo: Claro, Oscuro o Como el teléfono.
 * Se nota al instante: la cabecera, los botones y el fondo cambian sin
 * recargar. Es de este aparato, no del liceo.
 */
const ICONOS: Record<Modo, typeof Sun> = { claro: Sun, oscuro: Moon, sistema: Smartphone };

export function ColorDeLaApp({ className }: { className?: string } = {}) {
    const [elegido, setElegido] = React.useState<Acento>(ACENTO_POR_DEFECTO);
    const [modo, setModo] = React.useState<Modo>(MODO_POR_DEFECTO);
    React.useEffect(() => {
        setElegido(acentoGuardado());
        setModo(modoGuardado());
    }, []);

    return (
        <fieldset className={cn('border-t border-gray-200 px-5 py-3', className)}>
            <legend className="sr-only">Color de la app</legend>
            <div className="flex items-center gap-3 text-sm font-medium text-gray-800">
                <Palette className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                <span className="flex-1">Color de la app</span>
            </div>
            <div role="radiogroup" aria-label="Color de la app" className="mt-3 flex flex-wrap gap-3 pl-8">
                {(Object.keys(ACENTOS) as Acento[]).map((a) => {
                    const activo = a === elegido;
                    return (
                        <button
                            key={a}
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            aria-label={ACENTOS[a].nombre}
                            title={ACENTOS[a].nombre}
                            data-color={a}
                            onClick={() => {
                                elegirAcento(a);
                                setElegido(a);
                            }}
                            className={`flex h-11 w-11 items-center justify-center rounded-full ring-offset-2 transition-shadow ${
                                activo ? 'ring-2 ring-cabecera-tinta' : 'ring-1 ring-gray-200'
                            }`}
                            style={{ backgroundColor: ACENTOS[a].color }}
                        >
                            {activo && <Check className={cn('h-5 w-5', a === 'amarillo' ? 'text-[#0B1B33]' : 'text-white')} aria-hidden />}
                        </button>
                    );
                })}
            </div>
            <div role="radiogroup" aria-label="Modo de la app" className="mt-3 ml-8 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
                {(Object.keys(MODOS) as Modo[]).map((m) => {
                    const Icono = ICONOS[m];
                    const activo = m === modo;
                    return (
                        <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            data-modo={m}
                            onClick={() => {
                                elegirModo(m);
                                setModo(m);
                            }}
                            className={cn(
                                'flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs font-semibold text-gray-600',
                                activo && 'bg-white text-gray-900 shadow-sm dark:bg-gray-300'
                            )}
                        >
                            <Icono className="h-4 w-4" aria-hidden />
                            {MODOS[m]}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

export default ColorDeLaApp;
