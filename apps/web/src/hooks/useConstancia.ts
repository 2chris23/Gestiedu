import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

export type TipoDeConstancia = 'ESTUDIO' | 'BUENA_CONDUCTA';

/** La constancia, tal como la arma el servidor (`services/constancias.service.ts`). */
export interface Constancia {
    tipo: TipoDeConstancia;
    liceo: { nombre: string; codigo: string | null; codigoDea: string | null; direccion: string | null; ciudad: string | null; telefono: string | null };
    firmante: { nombre: string | null; cedula: string | null; cargo: string };
    alumno: { cedula: string; nombres: string; apellidos: string };
    ciclo: { id: string; nombre: string };
    seccion: { grado: number; seccion: string; turno: string | null };
    nivel: string;
    vigente: boolean;
    emitidaEl: string;
}

/** Por `useQuery`, como la boleta: así se guarda en el teléfono. */
export function useConstancia(cedula: string, tipo: TipoDeConstancia) {
    return useQuery<Constancia>({
        queryKey: ['constancia', cedula, tipo],
        queryFn: async () => {
            const { data } = await api.get(`/students/${encodeURIComponent(cedula)}/constancia?tipo=${tipo}`);
            return data.data;
        },
        enabled: Boolean(cedula),
        retry: (veces, error: any) => {
            const status = error?.response?.status;
            return !(status >= 400 && status < 500) && veces < 2;
        },
    });
}
