'use client';

import * as React from 'react';
import { Check, Palette } from 'lucide-react';
import { ACENTOS, acentoGuardado, elegirAcento, type Acento } from '@/lib/tema-de-la-app';

/**
 * «COLOR DE LA APP», EN MI CUENTA
 *
 * Los cuatro del diseño (Turquesa, Violeta, Amarillo, Coral) en círculos de
 * 44 px. Se nota al instante: el botón de Inicio y lo que lleva acento
 * cambian sin recargar. Es de este teléfono, no del liceo.
 */
export function ColorDeLaApp() {
    const [elegido, setElegido] = React.useState<Acento>('turquesa');
    React.useEffect(() => setElegido(acentoGuardado()), []);

    return (
        <fieldset className="border-t border-gray-200 px-5 py-3">
            <legend className="sr-only">Color de la app</legend>
            <div className="flex items-center gap-3 text-sm font-medium text-gray-800">
                <Palette className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
                <span className="flex-1">Color de la app</span>
            </div>
            <div role="radiogroup" aria-label="Color de la app" className="mt-3 flex gap-3 pl-8">
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
                                activo ? 'ring-2 ring-[#0D47A1]' : 'ring-1 ring-gray-200'
                            }`}
                            style={{ backgroundColor: ACENTOS[a].color }}
                        >
                            {activo && <Check className="h-5 w-5 text-[var(--sobre-acento)]" aria-hidden />}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

export default ColorDeLaApp;
