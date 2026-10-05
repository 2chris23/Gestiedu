'use client';

import * as React from 'react';
import { useAuthStore } from '@/store/auth.store';
import { EsqueletoDelInicioMovil } from '@/components/dashboard/InicioDelAdminMovil';

/**
 * El esqueleto del Inicio mientras carga. El admin en el teléfono tiene su
 * Inicio azul: esperar sobre el gris del ordenador y saltar a azul se veía
 * como un parpadeo. El rol del almacén basta aquí: es solo la forma.
 */
export function EsqueletoSegunElRol({ children }: { children: React.ReactNode }) {
    const rol = useAuthStore((s) => s.user?.role);
    // Tras montar: el servidor no conoce el almacén y la primera pintada debe coincidir.
    const [montado, setMontado] = React.useState(false);
    React.useEffect(() => setMontado(true), []);
    if (!montado || rol !== 'ADMIN') return <>{children}</>;
    return (
        <>
            <EsqueletoDelInicioMovil />
            <div className="hidden lateral:block">{children}</div>
        </>
    );
}
