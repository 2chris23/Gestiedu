'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/config/env';
import { conseguirCredencial } from '@/lib/credencial-en-memoria';
import { elServidorContesto } from '@/lib/estado-del-servidor';
import { preguntarAlServidor } from '@/hooks/useConexion';

/**
 * LO QUE CAMBIA, APARECE SOLO
 *
 * El servidor avisa a quien le toca cada vez que alguien guarda algo
 * (`datos:cambiaron`). Aquí se escucha ese aviso y se vuelven a pedir los datos
 * **de lo que esté abierto en ese momento**. Nadie tiene que recargar la página.
 *
 * Se refresca todo lo que esté a la vista, no solo lo del recurso que cambió, y
 * es a propósito: un cambio en una nota mueve el promedio del alumno, el panel y
 * el boletín. Mantener a mano una lista de "qué refresca qué" es garantizar que
 * algún día se olvide una y una pantalla se quede enseñando algo viejo — que es
 * justo lo que no puede pasar.
 *
 * ─── POR QUÉ SE ATIENDE EL PRIMER AVISO AL INSTANTE ──────────────────────────
 *
 * Antes se esperaban 800 ms antes de refrescar, para que una tanda de guardados
 * no provocara una petición por cada uno. La intención era buena; el precio, no:
 * **medido, lo que otro guardaba tardaba 841 ms en aparecer** (831 mínimo, 855
 * máximo — clavado, porque casi todo era la espera). El viaje de verdad —aviso,
 * petición, pintado— son unos 41 ms.
 *
 * Es decir: se esperaba veinte veces más de lo que costaba hacer el trabajo.
 *
 * Ahora **el primer aviso se atiende de inmediato** y la ventana solo sirve para
 * absorber los que vengan detrás: durante `VENTANA_DE_AGRUPACION` no se vuelve a
 * pedir, y al cerrarse la ventana se hace una última pasada si hubo más cambios.
 * Una tanda de treinta notas sigue costando dos peticiones, no treinta, pero la
 * primera se ve al instante.
 */

/** Tras refrescar, se esperan estos ms antes de volver a hacerlo. */
const VENTANA_DE_AGRUPACION = 700;

export function TiempoRealProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();
    const socketRef = useRef<Socket | null>(null);
    /** Cuándo se refrescó por última vez, para no repetir dentro de la ventana. */
    const ultimoRefresco = useRef(0);
    /** Pasada final de una tanda, si llegaron avisos durante la ventana. */
    const pendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Cambió algo mientras la pestaña estaba de fondo: se refresca al volver. */
    const huboCambios = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        /**
         * LA CREDENCIAL YA NO SE LEE DE LAS COOKIES
         *
         * Aquí se sacaba de `document.cookie`, que es justo lo que se quitó: la
         * llave corta vive ahora en la memoria de la pestaña
         * (`lib/credencial-en-memoria.ts`). Pedirla es asíncrono —al recargar
         * hay que renovarla primero—, así que la conexión se abre cuando
         * llegue, no en la misma línea.
         *
         * `cancelado` es por si la pantalla se cierra mientras se pedía: sin
         * eso, se abriría un socket que ya no tiene quien lo escuche.
         */
        let cancelado = false;
        let socket: ReturnType<typeof io> | null = null;

        const pedirDeNuevoLoQueSeVe = () => {
            ultimoRefresco.current = Date.now();
            huboCambios.current = false;
            // Solo lo que está montado ahora mismo
            queryClient.invalidateQueries({ refetchType: 'active' });
        };

        const refrescarLoQueSeVe = () => {
            // Si la pestaña no está a la vista, no se gasta nada: se apunta que hay
            // algo nuevo y se refresca cuando la persona vuelva. En un liceo con
            // miles de sesiones abiertas, la mayoría están de fondo — refrescarlas
            // todas sería tirarle al servidor una avalancha por cada nota que se
            // guarda.
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
                huboCambios.current = true;
                return;
            }

            const desdeElUltimo = Date.now() - ultimoRefresco.current;

            // Fuera de la ventana: se atiende ya. Este es el caso normal —
            // alguien guarda algo y quien mira lo ve enseguida.
            if (desdeElUltimo >= VENTANA_DE_AGRUPACION) {
                pedirDeNuevoLoQueSeVe();
                return;
            }

            // Dentro de la ventana: es una tanda. Se apunta una última pasada
            // para cuando termine, y no se pide nada más por ahora.
            if (pendiente.current) return;
            pendiente.current = setTimeout(() => {
                pendiente.current = null;
                pedirDeNuevoLoQueSeVe();
            }, VENTANA_DE_AGRUPACION - desdeElUltimo);
        };

        const avisarDelPase = (aviso: unknown) => {
            window.dispatchEvent(new CustomEvent('gestiedu:asistencia-qr', { detail: aviso }));
        };

        const alVolverALaPestaña = () => {
            if (document.visibilityState === 'visible' && huboCambios.current) {
                pedirDeNuevoLoQueSeVe();
            }
        };

        document.addEventListener('visibilitychange', alVolverALaPestaña);

        void (async () => {
            /**
             * SI LA CREDENCIAL NO ESTÁ LISTA, SE ESPERA — NO SE ABANDONA
             *
             * Al abrir la página la credencial puede no estar todavía: hay que
             * renovarla, y esa renovación puede fallar por un momento (la red,
             * o el propio límite de intentos del servidor si se ha entrado
             * muchas veces seguidas).
             *
             * Rendirse al primer intento deja la pestaña **sin tiempo real para
             * siempre**, sin decir nada: lo que otro guarde no se verá hasta
             * recargar. Se cazó así, y no en una prueba de tiempo real sino en
             * la tanda completa, que es donde el límite llega a saltar.
             *
             * Se reintenta unas cuantas veces, cada vez esperando un poco más.
             */
            let token: string | null = null;
            for (let intento = 0; intento < 5 && !cancelado; intento++) {
                token = await conseguirCredencial();
                if (token) break;
                await new Promise((r) => setTimeout(r, 1500 * (intento + 1)));
            }

            if (!token || cancelado) return; // sin sesión no hay nada que escuchar

            const base = API_URL.replace(/\/api\/?$/, '');
            socket = io(base, {
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 10000,
            });
            socketRef.current = socket;

            socket.on('datos:cambiaron', refrescarLoQueSeVe);
            // El pase de lista por QR del profesor: alguien escaneó. Tampoco trae
            // datos; la pantalla del QR lo vuelve a pedir (`PaseDeListaQr`).
            socket.on('asistencia-qr:cambio', avisarDelPase);

            /**
             * AL CONECTAR TAMBIÉN, NO SOLO AL RECONECTAR
             *
             * Entre que se abre la pantalla y que el socket queda conectado pasa
             * un momento — ahora más, porque antes de conectar hay que
             * conseguir la credencial. **Lo que otro guarde en ese hueco no
             * llega**: el aviso se manda cuando todavía no hay nadie
             * escuchando, y no se vuelve a mandar.
             *
             * Se ve poco y se nota mucho: alguien abre la lista de materias,
             * otro crea una en ese mismo segundo, y la primera persona no la ve
             * hasta que recargue. Pedir los datos una vez al conectar cierra el
             * hueco; cuesta una consulta por pantalla abierta.
             */
            socket.on('connect', refrescarLoQueSeVe);

            // Al volver la conexión, lo que se ve puede estar viejo
            socket.on('reconnect', refrescarLoQueSeVe);

            // Si el servidor se va (apagado, reiniciándose), el canal se corta
            // al momento: es la primera noticia de que no hay servidor, antes
            // de que nadie pulse nada. Se comprueba, y si no contesta sale el
            // aviso de «estás viendo lo de antes» (`useConexion`).
            socket.on('disconnect', (motivo) => {
                if (motivo !== 'io client disconnect') void preguntarAlServidor();
            });
            socket.on('connect', () => elServidorContesto());
        })();

        return () => {
            cancelado = true;
            if (pendiente.current) clearTimeout(pendiente.current);
            document.removeEventListener('visibilitychange', alVolverALaPestaña);
            socket?.off('datos:cambiaron', refrescarLoQueSeVe);
            socket?.off('asistencia-qr:cambio', avisarDelPase);
            socket?.disconnect();
            socketRef.current = null;
        };
    }, [queryClient]);

    return <>{children}</>;
}

export default TiempoRealProvider;
