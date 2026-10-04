import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

/**
 * EL CUADRO DE HONOR (2026-10-04): la foto del último sábado, del servidor
 * (`/api/cuadro-de-honor`). Aquí no se calcula nada.
 */

export interface FilaDelCuadro {
    id: string;
    nombre: string;
    avatar: string | null;
    seccion: string | null;
    grado: number;
    puesto: number;
    /** Puestos que subió desde el sábado anterior (negativo: bajó; null: primera foto). */
    subio: number | null;
    puntaje: number;
    promedio: number;
    asistencia: number;
    observaciones: number;
    desglose: { notas: number; asistencia: number; resta: number };
}

export interface CuadroDeHonor {
    fecha: string | null;
    alcance?: string;
    alcances: Array<{ id: string; nombre: string }>;
    filas: FilaDelCuadro[];
}

export interface PuntajeDelAlumno {
    fecha: string | null;
    alcances: Array<{
        alcance: string;
        nombre: string;
        puntaje: number;
        subio: number | null;
        desglose: { promedio: number; asistencia: number; observaciones: number; notas: number; puntosAsistencia: number; resta: number };
        puestoAno?: number;
        puestoLiceo?: number;
    }>;
}

export function useCuadroDeHonor(alcance: string | null, ano: number | null) {
    return useQuery({
        queryKey: ['cuadro-de-honor', alcance ?? 'CICLO', ano ?? 'liceo'],
        queryFn: async () =>
            (await api.get('/cuadro-de-honor', { params: { ...(alcance ? { alcance } : {}), ...(ano ? { ano } : {}) } })).data as CuadroDeHonor,
        staleTime: 30 * 60 * 1000,
    });
}

export function usePuntajeDelAlumno(studentId: string | null | undefined) {
    return useQuery({
        queryKey: ['cuadro-de-honor', 'alumno', studentId],
        queryFn: async () => (await api.get(`/cuadro-de-honor/alumno/${encodeURIComponent(studentId!)}`)).data as PuntajeDelAlumno,
        enabled: Boolean(studentId),
        staleTime: 30 * 60 * 1000,
        retry: false,
    });
}

/** «sáb 03/10» */
export function fechaDeLaFoto(ymd: string | null): string {
    if (!ymd) return '';
    const [, m, d] = ymd.split('-');
    return `sáb ${d}/${m}`;
}
