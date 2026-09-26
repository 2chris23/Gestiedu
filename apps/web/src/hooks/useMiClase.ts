import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { EvaluationPlanRow } from '@/hooks/useEvaluationPlan';
import type { EstadoDeActividad } from '@/hooks/useActividadesDelAlumno';

export interface ActividadDeMiClase {
    id: string;
    title: string;
    description?: string | null;
    type: string;
    tag?: string | null;
    fecha: string | null;
    maxScore: number | null;
    nota: number | null;
    estado: EstadoDeActividad;
    criterio: string | null;
    semana: number | null;
    /** Si a este alumno se le evalúa de otra forma en esta actividad. */
    otraForma?: { metodo: string; motivo?: string | null } | null;
}

export interface ObservacionDeMiClase {
    id: string;
    title: string;
    description?: string | null;
    type: string;
    date: string;
    profesor: string | null;
}

export interface MiClase {
    alumnoId: string;
    inicioDelLapso: string | null;
    semanas: number | null;
    seccion: { id: string; name: string };
    materia: { id: string; name: string; color?: string | null };
    profesor: string | null;
    lapso: string;
    lapsoDeHoy: string;
    lapsos: { numero: string; name: string }[];
    plan: {
        membrete: Record<string, string | null> | null;
        filas: Partial<EvaluationPlanRow>[];
    };
    actividades: ActividadDeMiClase[];
    observaciones: ObservacionDeMiClase[];
}

/**
 * Una materia vista por el alumno o su representante: el plan, SUS
 * actividades con SU nota y SUS observaciones. El servidor recorta lo de los
 * demás (`mi-clase.controller.ts`); aquí no hay nada que escribir.
 */
export function useMiClase(alumnoId?: string | null, subjectId?: string | null, lapso?: string | null) {
    return useQuery({
        queryKey: ['miClase', alumnoId ?? '', subjectId ?? '', lapso ?? ''],
        queryFn: async () => {
            const { data } = await api.get(
                `/students/${encodeURIComponent(alumnoId as string)}/materias/${encodeURIComponent(subjectId as string)}/clase`,
                { params: lapso ? { lapso } : undefined }
            );
            return data as MiClase;
        },
        enabled: Boolean(alumnoId && subjectId),
        retry: false,
        // Al cambiar de lapso se queda lo de antes mientras llega lo nuevo; al
        // cambiar de materia, no (sería otra materia con el nombre de la vieja).
        placeholderData: (antes) => (antes?.materia.id === subjectId && antes?.alumnoId === alumnoId ? antes : undefined),
    });
}

export interface MateriaDelAlumno {
    id: string;
    name: string;
    color?: string | null;
    profesor: string | null;
}

/** Las materias de la sección del alumno: la entrada del representante a «Mi clase». */
export function useMisMaterias(alumnoId?: string | null) {
    return useQuery({
        queryKey: ['misMaterias', alumnoId ?? ''],
        queryFn: async () => {
            const { data } = await api.get(`/students/${encodeURIComponent(alumnoId as string)}/materias`);
            return data as { seccion: { id: string; name: string } | null; materias: MateriaDelAlumno[] };
        },
        enabled: Boolean(alumnoId),
        retry: false,
    });
}
