import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

/** La boleta del alumno, tal como la arma el servidor (`services/boleta.service.ts`). */
export interface Boleta {
    liceo: { nombre: string; codigo: string | null; direccion: string | null; ciudad: string | null; telefono: string | null };
    alumno: { cedula: string; nombres: string; apellidos: string; codigo: string | null };
    ciclo: { id: string; nombre: string };
    seccion: { id: string; grado: number; seccion: string; turno: string | null; guia: string | null };
    lapsos: Array<{ id: string; nombre: string; desde: string; hasta: string }>;
    materias: Array<{ id: string; nombre: string; notas: Record<string, number | null>; definitiva: number | null; aprobada: boolean | null }>;
    inasistencias: Record<string, { injustificadas: number; justificadas: number; tardanzas: number }>;
    promedios: Record<string, number | null> & { definitivo: number | null };
    reglas: { notaMinima: number; redondeo: 'MPPE' | 'NINGUNO' };
    emitidaEl: string;
}

/**
 * Va por `useQuery` a propósito: así se guarda en el teléfono y se puede
 * volver a ver sin señal (CLAUDE.md, «Sin señal se mira, no se toca»).
 */
export function useBoleta(cedula: string, academicYearId?: string) {
    return useQuery<Boleta>({
        queryKey: ['boleta', cedula, academicYearId ?? null],
        queryFn: async () => {
            const params = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : '';
            const { data } = await api.get(`/students/${encodeURIComponent(cedula)}/boleta${params}`);
            return data.data;
        },
        enabled: Boolean(cedula),
        // Un «no puedes» o un «no existe» no cambia por insistir.
        retry: (veces, error: any) => {
            const status = error?.response?.status;
            return !(status >= 400 && status < 500) && veces < 2;
        },
    });
}
