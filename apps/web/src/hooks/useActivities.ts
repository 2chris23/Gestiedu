import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

export interface Activity {
    id: string;
    title: string;
    name?: string;
    description?: string;
    type: string;
    scope: string;
    startDate: string;
    endDate?: string;
    dueDate?: string;
    maxGrade: number;
    weight: number;
    isActive: boolean;
    isVisible: boolean;
    periodId?: string;
    subjectId?: string;
    classroomId?: string;
    // Campos del Plan de Evaluación Venezolano
    temaGenerador?: string;
    tejidoTematico?: string;
    referentes?: string;
    tecnicas?: string;
    instrumentos?: string;
    criterios?: string;
    
    createdBy: string;
    creator?: { id: string; firstName: string; lastName: string };
    subject?: { id: string; name: string; code?: string };
    classroom?: { id: string; name: string; section: string; grade: number };
    period?: { id: string; name: string };
    _count?: { grades: number };
    createdAt: string;
    updatedAt: string;
}

interface CreateActivityInput {
    title: string;
    description?: string;
    type: string;
    scope: string;
    startDate: string;
    endDate?: string;
    dueDate?: string;
    maxGrade?: number;
    weight?: number;
    isVisible?: boolean;
    periodId?: string;
    subjectId?: string;
    classroomId?: string;
    lapso?: string;
    temaGenerador?: string;
    tejidoTematico?: string;
    referentes?: string;
    tecnicas?: string;
    instrumentos?: string;
    criterios?: string;
}

interface GetActivitiesParams {
    classroomId?: string;
    subjectId?: string;
    periodId?: string;
    lapso?: string;
    type?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

/**
 * Hook para obtener actividades con filtros
 */
export function useActivities(params: GetActivitiesParams) {
    const queryParams = new URLSearchParams();
    if (params.classroomId) queryParams.set('classroomId', params.classroomId);
    if (params.subjectId) queryParams.set('subjectId', params.subjectId);
    if (params.periodId) queryParams.set('periodId', params.periodId);
    if (params.lapso) queryParams.set('lapso', params.lapso);
    if (params.type) queryParams.set('type', params.type);
    if (params.page) queryParams.set('page', String(params.page));
    if (params.limit) queryParams.set('limit', String(params.limit));
    if (params.sortBy) queryParams.set('sortBy', params.sortBy);
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

    const queryString = queryParams.toString();

    return useQuery({
        queryKey: ['activities', params],
        queryFn: async () => {
            const response = await api.get<{ activities: Activity[]; pagination: any }>(
                `/activities?${queryString}`
            );
            return response.data;
        },
        enabled: !!(params.classroomId || params.subjectId),
    });
}

/**
 * Hook para obtener una actividad por ID
 */
export function useActivity(activityId: string) {
    return useQuery({
        queryKey: ['activity', activityId],
        queryFn: async () => {
            const response = await api.get<{ activity: Activity }>(`/activities/${activityId}`);
            return response.data.activity;
        },
        enabled: !!activityId,
    });
}

/**
 * Hook para crear actividad
 */
export function useCreateActivity() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateActivityInput) => {
            const response = await api.post<{ activity: Activity }>('/activities', data);
            return response.data.activity;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activities'] });
        },
    });
}

/**
 * Hook para actualizar actividad
 */
export function useUpdateActivity(activityId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: Partial<CreateActivityInput>) => {
            const response = await api.put<{ activity: Activity }>(`/activities/${activityId}`, data);
            return response.data.activity;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activities'] });
            queryClient.invalidateQueries({ queryKey: ['activity', activityId] });
        },
    });
}

/**
 * Hook para eliminar actividad
 */
export function useDeleteActivity() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (activityId: string) => {
            await api.delete(`/activities/${activityId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['activities'] });
        },
    });
}
