'use client';

import * as React from 'react';
import { dehydrate, hydrate, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import {
    deQuienEs,
    guardarLoDescargado,
    leerLoDescargado,
    olvidarLoDescargado,
} from '@/lib/lo-guardado-en-el-telefono';

/**
 * LA MEMORIA DEL TELÉFONO
 *
 * Guarda en el teléfono lo último que se descargó y lo devuelve al abrir la
 * app. Sin señal, en vez de una pantalla vacía se ve el horario de ayer, las
 * notas de ayer y la lista de ayer — con un aviso de que eso es lo que se está
 * viendo (`AvisoSinConexion`).
 *
 * ─── LO QUE NO HACE ─────────────────────────────────────────────────────────
 *
 * **No guarda nada para enviarlo luego.** Poner una nota, pasar asistencia o
 * cobrar un pago necesitan internet, y sin él se dice en el acto en vez de
 * dejarlo «pendiente»: una cola de cambios que se envían solos media hora
 * después, sobre datos que mientras tanto ha cambiado otro, es la forma más
 * rápida de perder una nota sin que nadie se entere. Eso se corta en
 * `lib/axios.ts`.
 *
 * ─── DE QUIÉN ES LO GUARDADO ────────────────────────────────────────────────
 *
 * De quien lo descargó, y de nadie más: la llave lleva el liceo y la cédula. Si
 * abre la app otra persona —un teléfono que se presta, un ordenador del
 * liceo—, lo de antes no se abre: se borra. Y al cerrar sesión, también.
 */

/** Cada cuánto se guarda, como mucho. Escribir en cada tecla no aporta nada. */
const CADA = 2000;

export function MemoriaDelTelefono({ children }: { children: React.ReactNode }) {
    const cliente = useQueryClient();
    const { user, isHydrated } = useAuthStore();

    const liceo = React.useMemo(() => {
        if (typeof document === 'undefined') return null;
        return (
            document.cookie
                .split('; ')
                .find((c) => c.startsWith('institute_slug='))
                ?.split('=')[1] ?? null
        );
    }, [user?.id]);

    const dueno = deQuienEs(liceo, user?.id);

    // ── Devolver lo guardado ─────────────────────────────────────────────
    React.useEffect(() => {
        if (!isHydrated) return;

        // Sin sesión no hay nada que devolver, y lo que hubiera es de otro.
        if (!dueno) {
            void olvidarLoDescargado();
            return;
        }

        let cancelado = false;
        void leerLoDescargado(dueno).then((guardado) => {
            if (cancelado || !guardado) return;
            // `hydrate` no pisa lo que ya esté más fresco en memoria: si una
            // pantalla ya recibió respuesta del servidor, se queda la del
            // servidor. Lo guardado solo rellena los huecos.
            hydrate(cliente, guardado.estado);
        });

        return () => {
            cancelado = true;
        };
    }, [cliente, dueno, isHydrated]);

    // ── Ir guardando lo que llega ────────────────────────────────────────
    React.useEffect(() => {
        if (!dueno) return;

        let reloj: ReturnType<typeof setTimeout> | null = null;

        const guardarPronto = () => {
            if (reloj) return;
            reloj = setTimeout(() => {
                reloj = null;
                const estado = dehydrate(cliente, {
                    // Solo lo que salió bien. Un error guardado se devolvería
                    // como si fuera el estado real de las cosas.
                    shouldDehydrateQuery: (consulta) =>
                        consulta.state.status === 'success' && consulta.state.data !== undefined,
                    // Nada de mutaciones: aquí no se guarda nada para enviar.
                    shouldDehydrateMutation: () => false,
                });
                void guardarLoDescargado(dueno, estado);
            }, CADA);
        };

        const dejarDeEscuchar = cliente.getQueryCache().subscribe((evento) => {
            if (evento.type === 'updated' || evento.type === 'added' || evento.type === 'removed') {
                guardarPronto();
            }
        });

        return () => {
            dejarDeEscuchar();
            if (reloj) clearTimeout(reloj);
        };
    }, [cliente, dueno]);

    return <>{children}</>;
}

export default MemoriaDelTelefono;
