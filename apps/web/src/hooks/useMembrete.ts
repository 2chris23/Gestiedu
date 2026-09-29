import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

/**
 * El membrete de los documentos del liceo (`GET /institutes/current/membrete`):
 * el texto del ministerio, el nombre oficial, los códigos del plantel (DEA,
 * estadístico, dependencia), la zona educativa, la entidad, el municipio, la
 * parroquia, la dirección, el teléfono y el logo. Se pone en Configuración →
 * Información General → «Datos oficiales del plantel».
 */
export interface Membrete {
    ministerio: string[];
    nombre: string;
    codigoDea: string | null;
    codigoEstadistico: string | null;
    codigoDependencia: string | null;
    codigoDelPlanDeEstudio?: string | null;
    zonaEducativa: string | null;
    entidadFederal: string | null;
    municipio: string | null;
    parroquia: string | null;
    direccion: string | null;
    telefono: string | null;
    logo: string | null;
    /** Si lleva el logo del Ministerio (Configuración → Información General). */
    logoDelMinisterio?: boolean;
}

export const membreteKey = ['membrete'] as const;

/** Por `useQuery`: se guarda en el teléfono y la hoja se puede ver sin señal. */
export function useMembrete() {
    return useQuery<Membrete>({
        queryKey: membreteKey,
        queryFn: async () => (await api.get('/institutes/current/membrete')).data.data,
        staleTime: 5 * 60_000,
        retry: (veces, error: any) => {
            const status = error?.response?.status;
            return !(status >= 400 && status < 500) && veces < 2;
        },
    });
}
