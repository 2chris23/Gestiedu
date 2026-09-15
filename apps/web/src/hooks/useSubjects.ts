import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subjectsService, Subject, CreateSubjectData, UpdateSubjectData } from '@/services/subjects.service';
import { toast } from 'sonner';

/**
 * Hook para obtener todas las materias con paginación y filtros
 */
export function useSubjects(params?: {
    page?: number;
    limit?: number;
    grade?: string;
    search?: string;
    isActive?: boolean;
    academicYearId?: string;
}) {
    return useQuery({
        queryKey: ['subjects', params],
        queryFn: () => subjectsService.getAllSubjects(params),
    });
}

/**
 * Hook para obtener una materia por ID o slug
 */
export function useSubject(id: string, academicYearName?: string, periodId?: string) {
    return useQuery({
        queryKey: ['subject', id, academicYearName, periodId],
        queryFn: () => subjectsService.getSubjectById(id, academicYearName, periodId),
        enabled: !!id,
    });
}

/**
 * Hook para crear una nueva materia
 */
export function useCreateSubject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateSubjectData) => subjectsService.createSubject(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subjects'] });
            toast.success('Materia creada exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al crear materia');
        },
    });
}

/**
 * Hook para actualizar una materia
 */
export function useUpdateSubject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: UpdateSubjectData }) =>
            subjectsService.updateSubject(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['subjects'] });
            queryClient.invalidateQueries({ queryKey: ['subject', variables.id] });
            toast.success('Materia actualizada exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al actualizar materia');
        },
    });
}

/**
 * Hook para eliminar una materia
 */
export function useDeleteSubject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => subjectsService.deleteSubject(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subjects'] });
            toast.success('Materia eliminada exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al eliminar materia');
        },
    });
}

/**
 * Hook para obtener estadísticas de materias
 */
export function useSubjectStats() {
    return useQuery({
        queryKey: ['subject-stats'],
        queryFn: () => subjectsService.getSubjectStats(),
    });
}
