import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classroomSubjectsService } from '@/services/classroomSubjects.service';
import { toast } from 'sonner';

/**
 * Hook para obtener todas las materias de una sección
 */
export function useClassroomSubjects(classroomId: string) {
    return useQuery({
        queryKey: ['classroomSubjects', classroomId],
        queryFn: () => classroomSubjectsService.getClassroomSubjects(classroomId),
        enabled: !!classroomId,
    });
}

/**
 * Hook para obtener materias con estadísticas (promedio, asistencia, etc.)
 * `periodId`: filtro por lapso/momento (Fase 3.5) — undefined = "Todo el ciclo".
 */
export function useClassroomSubjectsStats(classroomId: string, periodId?: string) {
    return useQuery({
        queryKey: ['classroomSubjectsStats', classroomId, periodId || 'all'],
        queryFn: () => classroomSubjectsService.getClassroomSubjectsStats(classroomId, periodId),
        enabled: !!classroomId,
    });
}

/**
 * Hook para obtener detalle de una materia en una sección
 */
export function useClassroomSubjectDetail(classroomId: string, subjectId: string) {
    return useQuery({
        queryKey: ['classroomSubject', classroomId, subjectId],
        queryFn: () => classroomSubjectsService.getClassroomSubjectDetail(classroomId, subjectId),
        enabled: !!classroomId && !!subjectId,
    });
}/**
 * Hook para obtener horario completo de una sección
 */
export function useClassroomSchedule(classroomId: string) {
    return useQuery({
        queryKey: ['classroomSchedule', classroomId],
        queryFn: () => classroomSubjectsService.getClassroomSchedule(classroomId),
        enabled: !!classroomId,
    });
}/**
 * Hook para actualización masiva de horario (drag & drop)
 */
export function useBulkUpdateSchedule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            classroomId,
            data,
        }: {
            classroomId: string;
            data: {
                blocks: Array<{
                    id?: string;
                    classroomSubjectId?: string;
                    dayOfWeek: number;
                    startTime: string;
                    endTime: string;
                    blockType?: string;
                    location?: string;
                    notes?: string;
                }>;
                deleteIds?: string[];
            };
        }) => classroomSubjectsService.bulkUpdateSchedule(classroomId, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classroomSchedule', variables.classroomId] });
            queryClient.invalidateQueries({ queryKey: ['classroomSubjects', variables.classroomId] });
            toast.success('Horario actualizado exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}
