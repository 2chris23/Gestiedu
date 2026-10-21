'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { ACENTOS, ACENTO_POR_DEFECTO, acentoGuardado, elegirAcento, type Acento } from '@/lib/tema-de-la-app';
import { MODOS, MODO_POR_DEFECTO, elegirModo, modoGuardado, type Modo } from '@/lib/modo-de-la-app';
import { Ajustes, Grupo } from '@/components/configuracion/ajustes';
import { cn } from '@/lib/utils';

/**
 * «COLOR Y MODO», EN CONFIGURACIÓN
 *
 * Los cinco colores en círculos y, debajo, el modo con una miniatura de la
 * pantalla en cada uno (como la Apariencia de Rial): se ve qué se elige antes
 * de elegirlo. Es de este aparato, no del liceo, y se nota al instante.
 */
export function ColorYModo() {
    const [elegido, setElegido] = React.useState<Acento>(ACENTO_POR_DEFECTO);
    const [modo, setModo] = React.useState<Modo>(MODO_POR_DEFECTO);
    // En el ordenador no es «el teléfono»: se nombra lo que se tiene delante.
    const [enTelefono, setEnTelefono] = React.useState(true);
    React.useEffect(() => setEnTelefono(window.matchMedia('(pointer: coarse)').matches), []);
    const nombreDe = (m: Modo) => (m === 'sistema' ? (enTelefono ? 'Como el teléfono' : 'Como el ordenador') : MODOS[m]);
    React.useEffect(() => {
        setElegido(acentoGuardado());
        setModo(modoGuardado());
    }, []);

    return (
        <Ajustes>
            <Grupo id="color" titulo="Color de la app" pie="La cabecera, la barra y los botones toman este color. Solo en este aparato.">
                <div role="radiogroup" aria-label="Color de la app" className="flex flex-wrap justify-between gap-3 px-4 py-4 sm:justify-start sm:gap-5">
                    {(Object.keys(ACENTOS) as Acento[]).map((a) => {
                        const activo = a === elegido;
                        return (
                            <button
                                key={a}
                                type="button"
                                role="radio"
                                aria-checked={activo}
                                aria-label={ACENTOS[a].nombre}
                                data-color={a}
                                onClick={() => {
                                    elegirAcento(a);
                                    setElegido(a);
                                }}
                                className="flex flex-col items-center gap-1.5"
                            >
                                <span
                                    className={cn(
                                        'flex h-12 w-12 items-center justify-center rounded-full ring-offset-2 ring-offset-white transition-shadow',
                                        activo ? 'ring-2 ring-gray-900' : 'ring-1 ring-black/10'
                                    )}
                                    style={{ backgroundColor: ACENTOS[a].color }}
                                >
                                    {activo && <Check className={cn('h-5 w-5', a === 'amarillo' ? 'text-[#0B1B33]' : 'text-white')} aria-hidden />}
                                </span>
                                <span className={cn('text-xs', activo ? 'font-semibold text-gray-900' : 'text-gray-600')}>{ACENTOS[a].nombre}</span>
                            </button>
                        );
                    })}
                </div>
            </Grupo>

            <Grupo id="modo" titulo="Modo">
                <div role="radiogroup" aria-label="Modo de la app" className="grid grid-cols-3 gap-3 px-4 py-4">
                    {(Object.keys(MODOS) as Modo[]).map((m) => {
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
                                className="flex flex-col items-center gap-2"
                            >
                                <Miniatura modo={m} activo={activo} />
                                <span className={cn('text-sm', activo ? 'font-semibold text-gray-900' : 'text-gray-600')}>{nombreDe(m)}</span>
                            </button>
                        );
                    })}
                </div>
            </Grupo>
        </Ajustes>
    );
}

/** Una pantallita: claro, oscuro, o partida en diagonal para «como el teléfono». Va siempre en claro: es un dibujo. */
function Miniatura({ modo, activo }: { modo: Modo; activo: boolean }) {
    const claro = '#ffffff';
    const oscuro = '#121212';
    const fondo =
        modo === 'claro' ? claro : modo === 'oscuro' ? oscuro : `linear-gradient(135deg, ${claro} 0 50%, ${oscuro} 50% 100%)`;
    return (
        <span
            aria-hidden
            className={cn(
                'modo-claro relative block aspect-[16/10] w-full overflow-hidden rounded-2xl transition-shadow',
                activo ? 'ring-2 ring-indigo-600 ring-offset-2 ring-offset-white' : 'ring-1 ring-gray-300'
            )}
            style={{ background: fondo }}
        >
            <span className="absolute left-[12%] top-[20%] block h-[9%] w-[42%] rounded-full" style={{ background: modo === 'oscuro' ? '#3e3e3e' : '#e5e7eb' }} />
            <span className="absolute left-[12%] top-[38%] block h-[9%] w-[28%] rounded-full" style={{ background: modo === 'oscuro' ? '#3e3e3e' : '#e5e7eb' }} />
            <span className="absolute bottom-[14%] right-[10%] block h-[22%] w-[14%] rounded-full bg-indigo-600" />
        </span>
    );
}

export default ColorYModo;
