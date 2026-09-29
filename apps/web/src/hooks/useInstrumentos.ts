import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { Instrumento, Marcas } from '@/lib/instrumentos';

/**
 * LOS INSTRUMENTOS DE EVALUACIÓN (`services/instrumentos.service.ts`)
 *
 * Se arman en el plan, en cada evaluación; se califica con ellos en la clase en
 * vivo marcando casillas; y salen en papel con el plan.
 */

export interface InstrumentoGuardado {
    tipo: Instrumento['tipo'];
    definicion: Instrumento;
    version: number;
    maximo: number;
}

export function useInstrumentoDeLaFila(rowId: string | null) {
    return useQuery({
        queryKey: ['instrumento', rowId],
        queryFn: async () =>
            (await api.get(`/evaluation-plan/rows/${rowId}/instrumento`)).data.data as {
                fila: { id: string; actividadEval: string | null; instrumentos: string | null; tecnicas: string | null; puntos: number | null; weekNumber: number };
                instrumento: InstrumentoGuardado | null;
            },
        enabled: Boolean(rowId),
    });
}

export function useGuardarInstrumento() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async ({ rowId, definicion, version }: { rowId: string; definicion: Instrumento; version?: number | null }) =>
            (await api.put(`/evaluation-plan/rows/${rowId}/instrumento`, { definicion, version: version ?? null })).data.data as InstrumentoGuardado,
        onSuccess: (_, v) => {
            void cola.invalidateQueries({ queryKey: ['instrumento', v.rowId] });
            void cola.invalidateQueries({ queryKey: ['instrumentos-del-plan'] });
            void cola.invalidateQueries({ queryKey: ['liveClassDetail'] });
        },
    });
}

export function useQuitarInstrumento() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async (rowId: string) => (await api.delete(`/evaluation-plan/rows/${rowId}/instrumento`)).data,
        onSuccess: (_, rowId) => {
            void cola.invalidateQueries({ queryKey: ['instrumento', rowId] });
            void cola.invalidateQueries({ queryKey: ['instrumentos-del-plan'] });
            // Sus actividades dejan de calificarse con él: la clase lo tiene que saber.
            void cola.invalidateQueries({ queryKey: ['liveClassDetail'] });
            void cola.invalidateQueries({ queryKey: ['classActivities'] });
        },
    });
}

/** Califica con el instrumento: alumno → sus marcas (o null para quitarle la nota). */
export function useCalificarConInstrumento() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async ({ activityId, marcas }: { activityId: string; marcas: Record<string, Marcas | null> }) =>
            (await api.post(`/sessions/activities/${activityId}/instrumento`, { marcas })).data.data as { calificados: number; notas: Record<string, number | null>; maximo: number },
        onSuccess: () => void cola.invalidateQueries({ queryKey: ['liveClassDetail'] }),
    });
}

export interface AlumnoDeLaLista {
    n: number;
    id: string;
    nombres: string;
    apellidos: string;
}

export function useActaDeSocializacion(classroomId: string, subjectId: string, lapso: string) {
    return useQuery({
        queryKey: ['acta-de-socializacion', classroomId, subjectId, lapso],
        queryFn: async () =>
            (await api.get('/evaluation-plan/acta-de-socializacion', { params: { classroomId, subjectId, lapso } })).data.data as {
                titulo: string;
                parrafos: string[];
                docente: string;
                area: string;
                seccion: string;
                lapso: string;
                alumnos: AlumnoDeLaLista[];
                emitidaEl: string;
            },
    });
}

export interface EvaluacionConInstrumento {
    id: string;
    semana: number;
    actividad: string;
    tecnica: string;
    nombreDelInstrumento: string;
    puntos: number;
    instrumento: Instrumento | null;
    maximo: number | null;
    calificadas: Array<{ id: string; titulo: string; instrumento: Instrumento; detalle: Record<string, { marcas: Marcas; total: number | null }> }>;
}

export function useInstrumentosDelLapso(classroomId: string, subjectId: string, lapso: string, conNotas = false) {
    return useQuery({
        queryKey: ['instrumentos-del-plan', classroomId, subjectId, lapso, conNotas],
        queryFn: async () =>
            (await api.get('/evaluation-plan/instrumentos-del-lapso', { params: { classroomId, subjectId, lapso, ...(conNotas ? { conNotas: '1' } : {}) } })).data.data as {
                docente: string;
                area: string;
                seccion: string;
                ciclo: string;
                lapso: string;
                alumnos: AlumnoDeLaLista[];
                evaluaciones: EvaluacionConInstrumento[];
            },
        enabled: Boolean(classroomId && subjectId && lapso),
    });
}
