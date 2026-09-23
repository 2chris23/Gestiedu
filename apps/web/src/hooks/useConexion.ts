'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { elEstadoDelServidor, escucharElServidor } from '@/lib/estado-del-servidor';

/** Cada cuánto se vuelve a preguntar, mientras el servidor no contesta. */
const CADA = 15_000;

export interface Conexion {
    /** Hay red y el servidor del liceo contesta. */
    hayConexion: boolean;
    /** Por qué no: el teléfono sin red, o la red bien y el servidor sin contestar. */
    motivo: 'sin-internet' | 'sin-servidor' | null;
    /** Cuándo contestó por última vez el servidor, si se sabe. */
    ultimaRespuesta: number | null;
}

/** Pregunta mínima al servidor: si contesta, las interceptoras lo apuntan solas. */
export async function preguntarAlServidor(): Promise<void> {
    await api.get('/health', { timeout: 4000 }).catch(() => undefined);
}

/**
 * ¿HAY CONEXIÓN CON EL LICEO?
 *
 * Junta las dos cosas que pueden fallar —el teléfono sin red, y el servidor sin
 * contestar— y, mientras no hay conexión, pregunta cada quince segundos para
 * enterarse en cuanto vuelva. Cuando vuelve, refresca lo que está a la vista:
 * lo de la pantalla era de antes y ahora se puede tener lo de ahora.
 */
export function useConexion(): Conexion {
    const cliente = useQueryClient();
    const servidor = React.useSyncExternalStore(escucharElServidor, elEstadoDelServidor, elEstadoDelServidor);
    const [conRed, setConRed] = React.useState(true);

    React.useEffect(() => {
        setConRed(typeof navigator === 'undefined' || navigator.onLine !== false);
        // Una pregunta al abrir: si la app arranca sin servidor, se sabe en
        // cuatro segundos como mucho, no cuando la primera pantalla se canse.
        void preguntarAlServidor();
        const si = () => {
            setConRed(true);
            void preguntarAlServidor();
        };
        const no = () => setConRed(false);
        window.addEventListener('online', si);
        window.addEventListener('offline', no);
        return () => {
            window.removeEventListener('online', si);
            window.removeEventListener('offline', no);
        };
    }, []);

    // Mientras no contesta: preguntar de vez en cuando, y al volver a la app.
    React.useEffect(() => {
        if (servidor.contesta) return;
        const reloj = setInterval(() => void preguntarAlServidor(), CADA);
        const alVolver = () => {
            if (document.visibilityState === 'visible') void preguntarAlServidor();
        };
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            clearInterval(reloj);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [servidor.contesta]);

    // Al volver la conexión, lo de la pantalla se pide de nuevo.
    const antes = React.useRef(servidor.contesta && conRed);
    const hay = servidor.contesta && conRed;
    React.useEffect(() => {
        if (hay && !antes.current) void cliente.invalidateQueries({ refetchType: 'active' });
        antes.current = hay;
    }, [hay, cliente]);

    return {
        hayConexion: hay,
        motivo: !conRed ? 'sin-internet' : !servidor.contesta ? 'sin-servidor' : null,
        ultimaRespuesta: servidor.ultimaRespuesta,
    };
}

/** «hoy a las 07:45», «ayer a las 18:10», «el 20/09 a las 10:00». */
export function cuandoFue(ms: number | null, ahora = new Date()): string | null {
    if (!ms) return null;
    const d = new Date(ms);
    const hora = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dia = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    if (dia(d) === dia(ahora)) return `hoy a las ${hora}`;
    if (dia(d) === dia(ayer)) return `ayer a las ${hora}`;
    return `el ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} a las ${hora}`;
}
