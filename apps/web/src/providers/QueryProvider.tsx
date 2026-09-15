'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { TiempoRealProvider } from './TiempoRealProvider';

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
            }),
            defaultOptions: {
                queries: {
                    staleTime: 5 * 60 * 1000, // 5 minutos - datos se consideran frescos
                    gcTime: 10 * 60 * 1000, // 10 minutos - tiempo en caché (antes cacheTime)
                    refetchOnWindowFocus: false, // No refetch al cambiar de ventana
                    retry: 1, // Solo 1 reintento en caso de error
                    retryDelay: 1000, // 1 segundo entre reintentos
                    networkMode: 'online', // Solo ejecutar queries cuando hay conexión
                },
            },
        });

        return cliente;
    });

    return (
        <QueryClientProvider client={queryClient}>
            {/* Escucha los avisos del servidor y refresca lo que esté a la vista:
                nadie tiene que recargar la página para ver lo que otro cambió. */}
            <TiempoRealProvider>{children}</TiempoRealProvider>
            {process.env.NODE_ENV === 'development' && (
                <ReactQueryDevtools initialIsOpen={false} />
            )}
        </QueryClientProvider>
    );
}
