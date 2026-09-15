import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsService } from '@/services/students.service';

/**
 * Hook para obtener estudiantes de una sección con paginación
 * `options.periodId`: filtro por lapso/momento (Fase 3.5).
 */
export function useStudents(
    sectionId: string,
    options?: { page?: number; limit?: number; search?: string; periodId?: string; subjectId?: string }
) {
    return useQuery({
        queryKey: ['students', sectionId, options],
        queryFn: () => studentsService.getStudentsBySection(sectionId, options),
        enabled: !!sectionId,
    });
}

/**
 * Hook para obtener estudiantes disponibles (sin sección asignada)
 */
export function useAvailableStudents(search?: string, academicYearId?: string) {
    return useQuery({
        queryKey: ['students', 'available', search, academicYearId],
        queryFn: () => studentsService.getAvailableStudents(search, academicYearId),
        staleTime: 2 * 60 * 1000,
    });
}

/**
 * Hook para asignar un estudiante a una sección
 */
export function useAssignStudent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ studentId, sectionId }: { studentId: string; sectionId: string }) =>
            studentsService.assignStudentToSection(studentId, sectionId),
        onSuccess: (_, variables) => {
            // Invalidar queries relacionadas para refrescar datos
            queryClient.invalidateQueries({ queryKey: ['students', variables.sectionId] });
            queryClient.invalidateQueries({ queryKey: ['students', 'available'] });
        },
    });
}

/**
 * Hook para obtener estadísticas del dashboard de un estudiante
 */
export function useStudentDashboard(studentId?: string) {
    return useQuery({
        queryKey: ['studentDashboard', studentId],
        queryFn: () =>
            studentId
                ? studentsService.getStudentDashboardStatsById(studentId)
                : studentsService.getDashboardStats(),
        staleTime: 2 * 60 * 1000, // 2 minutos (datos más volátiles)
        retry: false, // No reintentar si falla (ej: 403)
    });
}
