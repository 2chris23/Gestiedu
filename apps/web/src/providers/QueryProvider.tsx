'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
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
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            {process.env.NODE_ENV === 'development' && (
                <ReactQueryDevtools initialIsOpen={false} />
            )}
        </QueryClientProvider>
    );
}
