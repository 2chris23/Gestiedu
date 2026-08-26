import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import { toast } from 'sonner';
import type { PlanColumnDef } from '@/components/evaluation/planColumns';

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
    dueToday?: boolean;
    belongsToSession?: boolean;
    isFuture?: boolean;
    createdAt: string;
}

export interface LiveClassDetail {
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

export interface LiveOverviewSubject {
    subjectName: string;
    color?: string;
    weekNumber?: number;
    temaGenerador?: string;
    firstColumnLabel?: string;
    activitiesCount?: number;
}

export function useLiveOverview(classroomId: string, date: string) {
    return useQuery({
        queryKey: ['liveOverview', classroomId, date],
        queryFn: async () => {
            if (!classroomId || !date) return null;
            const { data } = await api.get('/sessions/live-overview', {
                params: { classroomId, date },
            });
            return data as { overview: Record<string, LiveOverviewSubject> };
        },
        enabled: !!classroomId && !!date,
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['liveClassDetail'] });
            toast.success('Calificaciones guardadas exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al guardar calificaciones');
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
        mutationFn: async (payload: { classroomId: string; subjectId: string; date: string; reason?: string }) => {
            const { data } = await api.post('/sessions/suspend', payload);
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['liveClassDetail', variables.classroomId, variables.subjectId],
            });
            queryClient.invalidateQueries({ queryKey: ['classroomHistory'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al suspender la clase');
        },
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
