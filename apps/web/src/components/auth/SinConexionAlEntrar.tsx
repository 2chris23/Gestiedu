'use client';

import * as React from 'react';
import { CloudOff } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { preguntarAlServidor } from '@/hooks/useConexion';
import { elEstadoDelServidor } from '@/lib/estado-del-servidor';

/**
 * ABRIR LA APP SIN CONEXIÓN NO ES VOLVER A ENTRAR
 *
 * La app del teléfono abre en la pantalla de entrada. Con el servidor apagado,
 * esa pantalla salía (guardada) pero no servía de nada: no se puede entrar sin
 * servidor, y quien ya tenía la sesión abierta en ese teléfono se quedaba
 * delante de un formulario inútil en vez de ver lo que ya tenía guardado.
 *
 * Si hay sesión en este dispositivo y el servidor no contesta, se va a lo
 * último guardado. Quien cerró sesión no tiene nada guardado (se borra al
 * salir), así que a él se le queda el formulario, que es lo correcto.
 */
export function SinConexionAlEntrar() {
    const { user, isHydrated } = useAuthStore();
    const [yendo, setYendo] = React.useState(false);

    React.useEffect(() => {
        if (!isHydrated || !user?.id) return;
        let cancelado = false;
        void preguntarAlServidor().then(() => {
            if (cancelado || elEstadoDelServidor().contesta) return;
            setYendo(true);
            window.location.replace('/dashboard');
        });
        return () => {
            cancelado = true;
        };
    }, [isHydrated, user?.id]);

    if (!yendo) return null;
    return (
        <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow">
            <CloudOff className="h-4 w-4 text-amber-600" aria-hidden />
            Sin conexión con el liceo: abriendo lo último guardado…
        </div>
    );
}

export default SinConexionAlEntrar;
