'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { Fila } from '@/components/configuracion/ajustes';
import { TIEMPOS_DE_BLOQUEO, elegirTiempoDeBloqueo, esLaApp, tiempoDeBloqueo } from '@/lib/el-candado';

/**
 * «BLOQUEAR LA APP AL VOLVER», EN CONFIGURACIÓN → CONTRASEÑA Y ACCESO
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
        <Fila
            icono={Lock}
            etiqueta="Bloquear al volver"
            descripcion={valor === 0 ? 'Cada vez que salgas, también al elegir una foto o usar la cámara.' : 'Al abrirla, siempre. Al volver, pasado este tiempo.'}
        >
            <select
                value={valor}
                onChange={(e) => {
                    const v = Number(e.target.value);
                    elegirTiempoDeBloqueo(v);
                    setValor(v);
                }}
                className="min-h-[44px] max-w-[9rem] rounded-xl bg-gray-100 px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Bloquear la app al volver"
            >
                {TIEMPOS_DE_BLOQUEO.map((t) => (
                    <option key={t.valor} value={t.valor}>
                        {t.nombre}
                    </option>
                ))}
            </select>
        </Fila>
    );
}

export default BloquearAlVolver;
