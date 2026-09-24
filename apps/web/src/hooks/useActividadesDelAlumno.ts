import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

/**
 * LO QUE LE FALTA A UN ALUMNO
 *
 * Lo pide el propio alumno, su representante, un profesor suyo o el admin: el
 * servidor decide quién puede (`assertCanSeeStudent`).
 */

export type EstadoDeActividad = 'EVALUADA' | 'VENCIDA' | 'PENDIENTE';

export interface ActividadDelAlumno {
    id: string;
    title: string;
    description?: string | null;
    type: string;
    tag?: string | null;
    /** Día que importa: el de entrega, o el de la clase donde se puso. */
    fecha: string | null;
    maxScore: number | null;
    nota: number | null;
    estado: EstadoDeActividad;
    subject: { id: string; name: string; color?: string | null };
    classroom: { id: string; name: string };
}

export interface ResumenDeActividades {
    pendientes: number;
    vencidas: number;
    evaluadas: number;
}

export const ESTADO_DE_ACTIVIDAD: Record<EstadoDeActividad, { texto: string; clases: string }> = {
    PENDIENTE: { texto: 'Pendiente', clases: 'border-blue-300 bg-blue-50 text-blue-900' },
    VENCIDA: { texto: 'Se pasó la fecha', clases: 'border-rose-300 bg-rose-50 text-rose-900' },
    EVALUADA: { texto: 'Con nota', clases: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
};

export function useActividadesDelAlumno(studentId?: string | null, academicYearId?: string) {
    return useQuery({
        queryKey: ['actividadesDelAlumno', studentId, academicYearId ?? ''],
        queryFn: async () => {
            const { data } = await api.get(`/students/${encodeURIComponent(studentId as string)}/actividades`, {
                params: academicYearId ? { academicYearId } : undefined,
            });
            return data as { actividades: ActividadDelAlumno[]; resumen: ResumenDeActividades };
        },
        enabled: Boolean(studentId),
        retry: false,
    });
}
