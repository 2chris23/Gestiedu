'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { TiempoRealProvider } from './TiempoRealProvider';
import { MemoriaDelTelefono } from './MemoriaDelTelefono';
import { MAXIMO_DE_DIAS } from '@/lib/lo-guardado-en-el-telefono';
import { esQueNoContesta } from '@/lib/estado-del-servidor';
import { MENSAJE_SIN_CONEXION } from '@/lib/axios';
import { toast } from 'sonner';

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => {
        /**
         * LO QUE GUARDAS, SE VE — SIN RECARGAR
         *
         * Cada pantalla enseña varias cosas sacadas del mismo dato. Al poner una
         * nota cambian, además de la nota: el promedio del alumno, el promedio de
         * la materia, los medidores de la sección y el panel de inicio.
         *
         * Antes, cada guardado refrescaba a mano una lista corta de cosas
         * (`grades`, `studentGrades`) y se olvidaba del resto: la nota aparecía
         * pero los medidores seguían con el número viejo hasta recargar la página.
         *
         * Aquí se cierra de una vez: **cuando cualquier guardado sale bien, se
         * vuelve a pedir todo lo que está a la vista**. No hay lista que mantener
         * ni nada que se pueda olvidar al añadir una pantalla nueva.
         *
         * Cuesta poco porque solo se refresca lo que está montado en ese momento
         * —entre una y cuatro peticiones— y el servidor responde en milisegundos.
         */
        const cliente: QueryClient = new QueryClient({
            mutationCache: new MutationCache({
                onSuccess: () => {
                    cliente.invalidateQueries({ refetchType: 'active' });
                },
                // Guardar sin conexión: el aviso sale siempre, lo diga o no la
                // pantalla. Con un solo `id` para no apilar veinte iguales.
                onError: (error) => {
                    if (esQueNoContesta(error)) {
                        toast.error(MENSAJE_SIN_CONEXION, { id: 'sin-conexion', duration: 6000 });
                    }
                },
            }),
            defaultOptions: {
                queries: {
                    staleTime: 5 * 60 * 1000, // 5 minutos - datos se consideran frescos
                    /**
                     * DIEZ MINUTOS ERA POCO PARA UN TELÉFONO
                     *
                     * Pasado este tiempo sin usarse, React Query tira el dato
                     * de la memoria. Y lo que no está en memoria no se puede
                     * guardar en el teléfono: el horario que se miró por la
                     * mañana desaparecía a mediodía y por la tarde, sin señal,
                     * la pantalla salía vacía. Ahora dura lo mismo que lo
                     * guardado (`MAXIMO_DE_DIAS`), que es quien manda.
                     */
                    gcTime: MAXIMO_DE_DIAS * 24 * 60 * 60 * 1000,
                    refetchOnWindowFocus: false, // No refetch al cambiar de ventana
                    // Un reintento si el servidor contestó con un error; ninguno si
                    // no contestó: insistir solo alarga la espera, y lo guardado
                    // ya se está enseñando.
                    retry: (intentos, error) => !esQueNoContesta(error) && intentos < 1,
                    retryDelay: 1000, // 1 segundo entre reintentos
                    // Sin conexión no se pide nada; lo que ya estaba guardado
                    // se sigue viendo, que es justo lo que se busca.
                    networkMode: 'online',
                },
                mutations: {
                    /**
                     * SIN SEÑAL, GUARDAR FALLA — NO SE QUEDA ESPERANDO
                     *
                     * Por defecto React Query PAUSA lo que se guarda sin
                     * conexión y lo manda solo cuando vuelve. Suena bien y no
                     * lo es: media hora después se enviaría una nota sobre
                     * datos que mientras tanto ha cambiado otro profesor, y
                     * nadie se entera. Aquí se intenta y se falla en el acto,
                     * con un mensaje claro (ver `lib/axios.ts`).
                     */
                    networkMode: 'always',
                },
            },
        });

        return cliente;
    });

    return (
        <QueryClientProvider client={queryClient}>
            {/* Guarda en el teléfono lo último que se descargó y lo devuelve
                al abrir sin señal. */}
            <MemoriaDelTelefono>
                {/* Escucha los avisos del servidor y refresca lo que esté a la
                    vista: nadie tiene que recargar la página para ver lo que
                    otro cambió. */}
                <TiempoRealProvider>{children}</TiempoRealProvider>
            </MemoriaDelTelefono>
            {/* Su botón se pinta abajo a la derecha, encima de la barra de
                tareas del teléfono. En pantalla pequeña no se enseña: estorba
                justo donde se prueba la app. */}
            {process.env.NODE_ENV === 'development' && (
                <div className="hidden lg:block">
                    <ReactQueryDevtools initialIsOpen={false} />
                </div>
            )}
        </QueryClientProvider>
    );
}
