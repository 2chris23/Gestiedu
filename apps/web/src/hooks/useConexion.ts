'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '@/config/env';
import { elEstadoDelServidor, escucharElServidor, elServidorContesto, elServidorNoContesta } from '@/lib/estado-del-servidor';
import { conAzar } from '@/lib/azar';

const API_BASE_URL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

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

/**
 * Pregunta periódica al liceo: comprueba los DOS caminos en paralelo.
 * 1. La API de datos (/health).
 * 2. El propio servidor de la web (/api/estoy, GET sin datos, no-store).
 *
 * Solo marca «contesta» si responden los dos caminos.
 * Si cualquiera de los dos falla o no llega a tiempo (4 s), marca «no contesta».
 */
export async function preguntarAlServidor(): Promise<void> {
    const controlador = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const reloj = controlador ? setTimeout(() => controlador.abort(), 4000) : null;
    const signal = controlador?.signal;

    try {
        const rutaWeb = typeof window !== 'undefined' ? '/api/estoy' : 'http://localhost:3000/api/estoy';
        const consultarApi = fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-store' },
            signal,
        })
            .then((r) => r.ok)
            .catch(() => false);

        const consultarWeb = fetch(rutaWeb, {
            method: 'GET',
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-store' },
            signal,
        })
            .then((r) => r.ok)
            .catch(() => false);

        const [apiOk, webOk] = await Promise.all([consultarApi, consultarWeb]);

        if (apiOk && webOk) {
            elServidorContesto();
        } else {
            elServidorNoContesta();
        }
    } catch {
        elServidorNoContesta();
    } finally {
        if (reloj) clearTimeout(reloj);
    }
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
        // Cada 15 s, con azar (de 10,5 a 19,5): si todos preguntan al mismo
        // ritmo, al volver el servidor le llegan todos juntos.
        let reloj = 0;
        const otraVez = () => {
            reloj = window.setTimeout(() => {
                void preguntarAlServidor();
                otraVez();
            }, conAzar(CADA));
        };
        otraVez();
        const alVolver = () => {
            if (document.visibilityState === 'visible') void preguntarAlServidor();
        };
        document.addEventListener('visibilitychange', alVolver);
        return () => {
            window.clearTimeout(reloj);
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
