import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { toast } from 'sonner';
import type { PlanColumnDef } from '@/components/evaluation/planColumns';
import { recordarPendiente, olvidarPendiente } from '@/lib/guardado-optimista';

export interface LiveClassStudent {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    studentCode?: string;
    status: string | null;
    external?: boolean;
    originClassroom?: string | null;
}

export interface LiveClassPlanContent {
    headers: Array<{ id: string; title?: string; headingLevel?: number }>;
    fields: Array<{ id: string; label?: string; content?: string }>;
    evaluations: Array<{ id: string; actividadEval?: string; tecnicas?: string; instrumentos?: string; criterios?: string; ponderacion?: number; puntos?: number; tipoEvaluacion?: string }>;
    texts: Array<{ id: string; textContent?: string }>;
    indicators: Array<{ id: string; indicadores?: string }>;
}

export interface ClassActivity {
    id: string;
    title: string;
    description?: string;
    type: string;
    target: string;
    tag?: string;
    dueDate?: string | null;
    maxScore?: number;
    scores?: Record<string, number | null> | null;
    isDone: boolean;
    carriedOver: boolean;
    planRowId?: string | null;
    classSessionId?: string | null;
    classSession?: { id: string; date: string; startTime?: string; endTime?: string } | null;
    dueToday?: boolean;
    belongsToSession?: boolean;
    isFuture?: boolean;
    createdAt: string;
    createdDate?: string | null;
}

export interface LiveClassDetail {
    /** La sección donde se da la clase, con su turno (mañana / tarde). */
    classroom?: { id: string; name: string; shift?: string; grade?: number; section?: string } | null;
    session: {
        id: string;
        topic?: string;
        observations?: string;
        observationsTitle?: string;
        involvedStudentIds?: string[];
        status?: string;
        suspendedReason?: string;
    } | null;
    subject: { id: string; name: string; color?: string; slug?: string } | null;
    teacher: { id: string; firstName: string; lastName: string } | null;
    students: LiveClassStudent[];
    weekNumber?: number;
    planContent?: LiveClassPlanContent;
    planColumns?: PlanColumnDef[] | null;
    planLapso?: string;
    weekRow?: {
        id: string;
        title: string;
        label: string;
        textContent: string;
        actividadEval: string;
        tecnicas: string;
        instrumentos: string;
        criterios: string;
        tipoEvaluacion: string;
        ponderacion: number | null;
        puntos: number | null;
        extraData: Record<string, any>;
    } | null;
    activities: ClassActivity[];
}

export interface SaveLiveClassPayload {
    classroomId: string;
    subjectId: string;
    date: string;
    topic?: string;
    observations?: string;
    observationsTitle?: string;
    involvedStudentIds?: string[];
    startTime?: string;
    endTime?: string;
    attendances?: Array<{ studentId: string; status: string; comments?: string }>;
}

export function useLiveClassDetail(classroomId: string, subjectId: string, date: string) {
    return useQuery({
        queryKey: ['liveClassDetail', classroomId, subjectId, date],
        queryFn: async () => {
            if (!classroomId || !subjectId || !date) return null;
            const { data } = await api.get('/sessions/live-detail', {
                params: { classroomId, subjectId, date },
            });
            return data as LiveClassDetail;
        },
        enabled: !!classroomId && !!subjectId && !!date,
    });
}

/** Una actividad tal y como la ve quien mira el horario de ese día. */
export interface ActividadDelDia {
    id: string;
    title: string;
    type: string;
    tag?: string | null;
    target: string;
    dueDate: string | null;
    maxScore: number | null;
    /** Se puso en esa clase para otro día (el contador «Próx.»). */
    paraOtroDia: boolean;
    /** Solo llega cuando quien pregunta es el alumno (o su representante). */
    miNota?: number | null;
}

export interface LiveOverviewSubject {
    subjectName: string;
    color?: string;
    weekNumber?: number;
    temaGenerador?: string;
    firstColumnLabel?: string;
    activitiesCount?: number;
    todayActivitiesCount?: number;
    nextActivitiesCount?: number;
    suspendida?: boolean;
    actividades?: ActividadDelDia[];
}

/**
 * El contenido del horario de una sección en un día.
 *
 * Lo pide también el alumno para SU sección y el representante para la de su
 * representado: el servidor decide quién puede (`assertCanSeeClassroom`) y, si
 * es un alumno, le manda solo SU nota.
 */
export function useLiveOverview(classroomId: string, date: string, studentId?: string) {
    return useQuery({
        queryKey: ['liveOverview', classroomId, date, studentId ?? ''],
        queryFn: async () => {
            if (!classroomId || !date) return null;
            const { data } = await api.get('/sessions/live-overview', {
                params: { classroomId, date, ...(studentId ? { studentId } : {}) },
            });
            return data as { overview: Record<string, LiveOverviewSubject>; shift?: 'MANANA' | 'TARDE' | 'INTEGRAL' };
        },
        enabled: !!classroomId && !!date,
        // Que un alumno no pueda ver una sección no es un fallo que reintentar.
        retry: false,
    });
}

export function useClassActivities(classroomId?: string, subjectId?: string) {
    return useQuery({
        queryKey: ['classActivities', classroomId, subjectId],
        queryFn: async () => {
            if (!classroomId) return { activities: [] };
            const params: Record<string, string> = { classroomId };
            if (subjectId) params.subjectId = subjectId;
            const { data } = await api.get('/sessions/activities', { params });
            return data as { activities: ClassActivity[] };
        },
        enabled: Boolean(classroomId),
    });
}

export function useSaveLiveClass() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: SaveLiveClassPayload) => {
            const { data } = await api.post('/sessions/live-save', payload);
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId, variables.date],
            });
            queryClient.invalidateQueries({ queryKey: ['classroomHistory'] });
            queryClient.invalidateQueries({ queryKey: ['attendance'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al guardar la clase');
        },
    });
}

export function useCreateClassActivity() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            classroomId: string;
            subjectId: string;
            title: string;
            description?: string;
            type?: string;
            target?: string;
            tag?: string;
            dueDate?: string;
            maxScore?: number;
            planRowId?: string;
            classSessionId?: string;
        }) => {
            const { data } = await api.post('/sessions/activities', payload);
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId],
            });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al crear actividad');
        },
    });
}

export function useUpdateClassActivity() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            activityId,
            data
        }: {
            activityId: string;
            data: {
                title?: string;
                description?: string;
                type?: string;
                target?: string;
                tag?: string;
                dueDate?: string;
                maxScore?: number;
                scores?: Record<string, any>;
                isDone?: boolean;
                carriedOver?: boolean;
            }
        }) => {
            const res = await api.put(`/sessions/activities/${activityId}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liveClassDetail'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al actualizar actividad');
        },
    });
}

/**
 * GUARDAR NOTAS SIN QUE EL PROFESOR ESPERE
 *
 * Las notas se pintan en pantalla **antes** de que el servidor conteste, como
 * hace Instagram con el corazón del "me gusta". Se midió que bajo carga guardar
 * tardaba segundos: el profesor se quedaba mirando el botón.
 *
 * La diferencia con Instagram es que aquí **el dato importa**. Si el guardado
 * falla:
 *
 *   1. la pantalla vuelve a como estaba (no se miente sobre lo que se guardó);
 *   2. **las notas quedan apuntadas en el dispositivo** para reintentarlas, así
 *      que el profesor no tiene que acordarse ni volver a escribirlas;
 *   3. se le dice con claridad, sin que el aviso se vaya solo.
 *
 * Ver `lib/guardado-optimista.ts`.
 */
export function useSaveActivityGrades() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            activityId,
            scores,
            maxScore
        }: {
            activityId: string;
            scores: Record<string, number | null>;
            maxScore?: number;
        }) => {
            const { data } = await api.post(`/sessions/activities/${activityId}/grades`, { scores, maxScore });
            return data;
        },

        onMutate: async ({ activityId, scores }) => {
            // Que no llegue una respuesta vieja por detrás y pise lo que acabamos
            // de pintar.
            await queryClient.cancelQueries({ queryKey: ['liveClassDetail'] });

            const antes = queryClient.getQueriesData({ queryKey: ['liveClassDetail'] });

            queryClient.setQueriesData(
                { queryKey: ['liveClassDetail'] },
                (viejo: any) => {
                    if (!viejo?.activities) return viejo;
                    return {
                        ...viejo,
                        activities: viejo.activities.map((a: ClassActivity) =>
                            a.id === activityId
                                ? { ...a, scores: { ...(a.scores || {}), ...scores } }
                                : a
                        ),
                    };
                }
            );

            return { antes };
        },

        onError: (error: any, variables, contexto) => {
            // 1. La pantalla vuelve a la verdad.
            contexto?.antes?.forEach(([clave, datos]: [any, any]) => {
                queryClient.setQueryData(clave, datos);
            });

            // Una nota que el servidor rechaza por su valor (25 sobre 20, una
            // letra…) no se apunta para reintentar: volvería a rechazarse
            // siempre. Se dice qué tiene de malo y se corrige ahí mismo.
            if (error?.response?.status === 400) {
                toast.error(error?.response?.data?.error || 'Hay una nota que no es válida.');
                return;
            }

            // 2. Las notas NO se pierden.
            recordarPendiente({
                id: `notas:${variables.activityId}`,
                que: 'Calificaciones de una actividad',
                ruta: `/sessions/activities/${variables.activityId}/grades`,
                carga: { scores: variables.scores, maxScore: variables.maxScore },
                cuando: Date.now(),
                motivo: error?.response?.data?.message || error?.message,
            });

            // 3. Se avisa, y el aviso no se va solo.
            toast.error(
                'No se pudieron guardar las calificaciones. Quedaron apuntadas en este dispositivo: no hace falta volver a escribirlas.',
                { duration: Infinity }
            );
        },

        onSuccess: (_datos, variables) => {
            olvidarPendiente(`notas:${variables.activityId}`);
            toast.success('Calificaciones guardadas');
        },

        // Se pida o no, al final se contrasta con el servidor: lo que manda es
        // lo que está guardado, no lo que pintamos por adelantado.
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['liveClassDetail'] });
        },
    });
}

export function useDeleteClassActivity() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (activityId: string) => {
            const { data } = await api.delete(`/sessions/activities/${activityId}`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liveClassDetail'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al eliminar actividad');
        },
    });
}

export function useSuspendClass() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            classroomId: string;
            subjectId: string;
            date: string;
            reason?: string;
            /** Otra materia de la sección que entra en ese hueco (solo admin). */
            replacementSubjectId?: string;
        }) => {
            const { data } = await api.post('/sessions/suspend', payload);
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classReplacements'] });
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId],
            });
            queryClient.invalidateQueries({ queryKey: ['classroomHistory'] });
        },
        // Sin aviso aquí: el diálogo de suspender enseña el motivo del servidor
        // ("Beto no está libre: tiene Historia en 1er B…") donde se decide.
    });
}

export interface SearchStudentResult {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    studentCode?: string;
    classroomName?: string | null;
    academicYearName?: string | null;
    classroomId?: string | null;
}

export function useSearchStudents(search: string) {
    return useQuery({
        queryKey: ['searchStudents', search],
        queryFn: async () => {
            const { data } = await api.get('/sessions/search-students', {
                params: { search: search || undefined },
            });
            return (data.students || []) as SearchStudentResult[];
        },
        enabled: search.trim().length > 0,
        staleTime: 60 * 1000,
    });
}

export function useSavePlanWeek() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            classroomId: string;
            subjectId: string;
            date: string;
            values: Record<string, any>;
            columns?: PlanColumnDef[];
        }) => {
            const { data } = await api.post('/sessions/plan-week-save', payload);
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId],
            });
            queryClient.invalidateQueries({ queryKey: ['evaluationPlanRows'] });
            queryClient.invalidateQueries({ queryKey: ['evaluationPlanMetadata'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al guardar el plan');
        },
    });
}
