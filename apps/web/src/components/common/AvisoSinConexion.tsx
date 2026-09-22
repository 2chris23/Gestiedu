'use client';

import * as React from 'react';
import { CloudOff } from 'lucide-react';

/**
 * «ESTÁS VIENDO LO DE ANTES»
 *
 * Sin señal la app sigue enseñando lo último que se descargó, y eso solo es
 * útil si se dice. Una nota de ayer sin avisar es peor que una pantalla vacía:
 * el profesor cree que la de hoy no se guardó y la vuelve a poner.
 *
 * Aparece pegado arriba, debajo de la cabecera, y desaparece solo en cuanto
 * vuelve la conexión.
 */
export function AvisoSinConexion() {
    const [sinConexion, setSinConexion] = React.useState(false);

    React.useEffect(() => {
        // En la primera pintada del servidor no hay `navigator`, así que el
        // estado nace en `false` y se corrige aquí: si naciera en `true`, la
        // app saldría con el aviso puesto durante un instante en cada carga.
        setSinConexion(typeof navigator !== 'undefined' && navigator.onLine === false);

        const haySenal = () => setSinConexion(false);
        const noHaySenal = () => setSinConexion(true);

        window.addEventListener('online', haySenal);
        window.addEventListener('offline', noHaySenal);
        return () => {
            window.removeEventListener('online', haySenal);
            window.removeEventListener('offline', noHaySenal);
        };
    }, []);

    if (!sinConexion) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900"
        >
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p className="text-xs leading-snug">
                <span className="font-semibold">Sin conexión.</span> Estás viendo lo último que se descargó.
                Para guardar o cambiar algo hace falta internet.
            </p>
        </div>
    );
}

export default AvisoSinConexion;
