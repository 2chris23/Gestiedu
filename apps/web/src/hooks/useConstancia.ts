import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

export type TipoDeConstancia = 'ESTUDIO' | 'BUENA_CONDUCTA' | 'PROSECUCION' | 'RETIRO' | 'INSCRIPCION' | 'LABOR_SOCIAL';
export const TIPOS_DE_CONSTANCIA: TipoDeConstancia[] = ['ESTUDIO', 'BUENA_CONDUCTA', 'PROSECUCION', 'RETIRO', 'INSCRIPCION', 'LABOR_SOCIAL'];
export const NOMBRE_DE_LA_CONSTANCIA: Record<TipoDeConstancia, string> = {
    ESTUDIO: 'Constancia de estudio',
    BUENA_CONDUCTA: 'Constancia de buena conducta',
    PROSECUCION: 'Constancia de prosecución',
    RETIRO: 'Constancia de retiro',
    INSCRIPCION: 'Constancia de inscripción',
    LABOR_SOCIAL: 'Constancia de labor social',
};

/** La constancia, tal como la arma el servidor (`services/constancias.service.ts`). */
export interface Constancia {
    tipo: TipoDeConstancia;
    /** El título y los párrafos, ya rellenos con la plantilla del liceo (texto). */
    titulo: string;
    parrafos: string[];
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
