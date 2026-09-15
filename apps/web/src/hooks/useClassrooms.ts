import { useQuery } from '@tanstack/react-query';
import { classroomService } from '@/services/classroom.service';

/**
 * Hook para obtener lista de aulas con paginación
 */
export function useClassrooms(
    academicYearId?: string,
    options?: { page?: number; limit?: number }
) {
    return useQuery({
        queryKey: ['classrooms', academicYearId, options],
        queryFn: () => classroomService.getClassrooms(academicYearId, options),
    });
}

/**
 * Hook para obtener detalles de un aula específica
 */
export function useClassroom(id: string) {
    return useQuery({
        queryKey: ['classroom', id],
        queryFn: () => classroomService.getClassroom(id),
        enabled: !!id,
    });
}

/**
 * Hook para obtener detalles de un aula por slug
 */
export function useClassroomBySlug(slug: string, academicYear?: string) {
    return useQuery({
        queryKey: ['classroom', 'slug', slug, academicYear],
        queryFn: () => classroomService.getClassroomBySlug(slug, academicYear),
        enabled: !!slug,
    });
}

/**
 * Hook para obtener estadísticas académicas de un aula/sección
 */
export function useClassroomStats(idOrSlug: string, periodId?: string) {
    return useQuery({
        queryKey: ['classroom', 'stats', idOrSlug, periodId],
        queryFn: () => classroomService.getClassroomStats(idOrSlug, periodId),
        enabled: !!idOrSlug,
    });
}
