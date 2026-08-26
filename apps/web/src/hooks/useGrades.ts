import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

export interface Grade {
    id: string;
    score: number | null;
    scores?: any;
    comments?: string;
    metadata?: any;
    studentId: string;
    activityId: string;
    periodId: string;
    subjectId: string;
    teacherId: string;
    student?: { id: string; firstName: string; lastName: string; studentCode?: string };
    activity?: { id: string; name?: string; title?: string; type: string; weight: number; maxGrade?: number };
    subject?: { id: string; name: string };
    period?: { id: string; name: string };
    teacher?: { id: string; firstName: string; lastName: string };
    createdAt: string;
    updatedAt: string;
}

interface CreateGradeInput {
    score: number;
    comments?: string;
    studentId: string;
    activityId: string;
    periodId: string;
    subjectId: string;
}

interface BulkGradeInput {
    grades: CreateGradeInput[];
}

/**
 * Hook para obtener calificaciones con filtros
 */
export function useGrades(params: {
    activityId?: string;
    classroomId?: string;
    subjectId?: string;
    periodId?: string;
    studentId?: string;
    page?: number;
    limit?: number;
}) {
    const queryParams = new URLSearchParams();
    if (params.activityId) queryParams.set('activityId', params.activityId);
    if (params.classroomId) queryParams.set('classroomId', params.classroomId);
    if (params.subjectId) queryParams.set('subjectId', params.subjectId);
    if (params.periodId) queryParams.set('periodId', params.periodId);
    if (params.studentId) queryParams.set('studentId', params.studentId);
    if (params.page) queryParams.set('page', String(params.page));
    if (params.limit) queryParams.set('limit', String(params.limit || 100));

    return useQuery({
        queryKey: ['grades', params],
        queryFn: async () => {
            const response = await api.get<{ grades: Grade[]; pagination: any }>(
                `/grades?${queryParams.toString()}`
            );
            return response.data;
        },
        enabled: !!(params.activityId || params.classroomId || params.studentId),
    });
}

/**
 * Hook para obtener calificaciones de un estudiante
 */
export function useStudentGrades(studentId: string, periodId?: string, subjectId?: string) {
    const queryParams = new URLSearchParams();
    if (periodId) queryParams.set('periodId', periodId);
    if (subjectId) queryParams.set('subjectId', subjectId);

    return useQuery({
        queryKey: ['studentGrades', studentId, periodId, subjectId],
        queryFn: async () => {
            const response = await api.get(`/grades/student/${studentId}?${queryParams.toString()}`);
            return response.data;
        },
        enabled: !!studentId,
    });
}

/**
 * Hook para crear calificación individual
 */
export function useCreateGrade() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateGradeInput) => {
            const response = await api.post<{ grade: Grade }>('/grades', data);
            return response.data.grade;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['grades'] });
            queryClient.invalidateQueries({ queryKey: ['studentGrades'] });
        },
    });
}

/**
 * Hook para crear calificaciones en lote
 */
export function useBulkCreateGrades() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: BulkGradeInput) => {
            const response = await api.post('/grades/bulk', data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['grades'] });
            queryClient.invalidateQueries({ queryKey: ['studentGrades'] });
        },
    });
}

/**
 * Hook para actualizar calificación
 */
export function useUpdateGrade() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ gradeId, data }: { gradeId: string; data: { score?: number; comments?: string } }) => {
            const response = await api.put<{ grade: Grade }>(`/grades/${gradeId}`, data);
            return response.data.grade;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['grades'] });
            queryClient.invalidateQueries({ queryKey: ['studentGrades'] });
        },
    });
}

/**
 * Hook para eliminar calificación
 */
export function useDeleteGrade() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (gradeId: string) => {
            await api.delete(`/grades/${gradeId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['grades'] });
            queryClient.invalidateQueries({ queryKey: ['studentGrades'] });
        },
    });
}
