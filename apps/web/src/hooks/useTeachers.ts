import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teachersService } from '@/services/teachers.service';
import { classroomService } from '@/services/classroom.service';
import { toast } from 'sonner';

/**
 * Hook para obtener la lista de profesores
 */
export function useTeachers(search?: string) {
    return useQuery({
        queryKey: ['teachers', search],
        queryFn: () => teachersService.getTeachers({ search }),
        staleTime: 5 * 60 * 1000, // 5 minutos
        // Siempre revalidar al montar para reflejar profesores recién creados
        refetchOnMount: 'always',
    });
}

/**
 * Hook para asignar un profesor a una sección
 */
export function useAssignTeacher() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ classroomId, teacherId }: { classroomId: string; teacherId: string }) =>
            classroomService.assignTeacher(classroomId, teacherId),
        onSuccess: (_, variables) => {
            toast.success('Profesor asignado correctamente');
            // Invalidar queries relacionadas
            queryClient.invalidateQueries({ queryKey: ['classroom', variables.classroomId] });
            queryClient.invalidateQueries({ queryKey: ['classrooms'] });
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error al asignar profesor');
        },
    });
}
