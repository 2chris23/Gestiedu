'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { TIEMPOS_DE_BLOQUEO, elegirTiempoDeBloqueo, esLaApp, tiempoDeBloqueo } from '@/lib/el-candado';

/**
 * «BLOQUEAR LA APP AL VOLVER», EN MI CUENTA
 *
 * Cuánto puede estar uno fuera de la app sin que al volver pida la huella o
 * el bloqueo del teléfono (`lib/el-candado.ts`). Al abrirla, siempre. Es de
 * este teléfono. Solo en la app: en el navegador no hay candado.
 */
export function BloquearAlVolver() {
    const [enLaApp, setEnLaApp] = React.useState(false);
    const [valor, setValor] = React.useState(60_000);
    React.useEffect(() => {
        let pruebas = false;
        try {
            pruebas = localStorage.getItem('gestiedu:candado-en-el-navegador') === '1';
        } catch {
            /* nada */
        }
        setEnLaApp(esLaApp() || pruebas);
        setValor(tiempoDeBloqueo());
    }, []);
    if (!enLaApp) return null;

    return (
        <label className="flex min-h-[56px] w-full items-center gap-3 border-t border-gray-200 px-5 py-3 text-sm font-medium text-gray-800">
            <Lock className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
            <span className="flex-1">
                Bloquear la app al volver
                <span className="mt-0.5 block text-xs font-normal text-gray-600">
                    {valor === 0
                        ? 'Cada vez que salgas, también al elegir una foto o usar la cámara.'
                        : 'Al abrirla, siempre. Al volver a ella, pasado este tiempo.'}
                </span>
            </span>
            <select
                value={valor}
                onChange={(e) => {
                    const v = Number(e.target.value);
                    elegirTiempoDeBloqueo(v);
                    setValor(v);
                }}
                className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-800"
                aria-label="Bloquear la app al volver"
            >
                {TIEMPOS_DE_BLOQUEO.map((t) => (
                    <option key={t.valor} value={t.valor}>
                        {t.nombre}
                    </option>
                ))}
            </select>
        </label>
    );
}

export default BloquearAlVolver;
