'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth.store';

/**
 * QUIÉN ESTÁ MIRANDO LA PANTALLA
 *
 * El rol se guardaba solo en el navegador (`auth.store`, que recuerda al
 * usuario en el almacén local). Eso falla en dos casos reales: la primera
 * pintada, antes de que el almacén se recupere, y cualquier sesión que llegue
 * sin ese almacén —otro dispositivo, el modo privado, o alguien que limpió los
 * datos del navegador—. Cuando falla, la pantalla no sabe el rol y trata a un
 * alumno como si fuera del personal: le pide secciones que no son suyas y el
 * servidor le responde 403.
 *
 * Aquí el rol lo dice el SERVIDOR, que es quien lo sabe de verdad. Si el
 * almacén ya lo tenía, se usa y no se pregunta nada.
 */
export interface QuienSoy {
    id: string;
    role: 'ADMIN' | 'TEACHER' | 'STUDENT' | 'TUTOR';
}

export function useQuienSoy(): { yo: QuienSoy | null; cargando: boolean } {
    const { user, isHydrated } = useAuthStore();

    const faltaPreguntar = isHydrated && !user?.role;

    const { data, isLoading } = useQuery({
        queryKey: ['quienSoy'],
        queryFn: async () => {
            const { data } = await api.get('/auth/profile');
            const u = data?.user ?? data?.data?.user ?? data;
            return { id: u?.id, role: u?.role } as QuienSoy;
        },
        enabled: faltaPreguntar,
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    if (user?.role) {
        return { yo: { id: user.id, role: user.role as QuienSoy['role'] }, cargando: false };
    }

    return { yo: data?.role ? data : null, cargando: !isHydrated || isLoading };
}

export default useQuienSoy;
