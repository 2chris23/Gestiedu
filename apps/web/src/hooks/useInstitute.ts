import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instituteService, InstituteConfig, UpdateInstituteDto } from '@/services/institute.service';
import { toast } from 'sonner';

// Query keys
export const instituteKeys = {
    all: ['institute'] as const,
    config: () => [...instituteKeys.all, 'config'] as const,
    palette: () => [...instituteKeys.all, 'palette'] as const,
};

/**
 * Hook para obtener la configuración del instituto
 */
export function useInstituteConfig(options?: { enabled?: boolean }) {
    // Solo hacer la petición si hay token (evitar 401 en consola cuando no hay sesión)
    const hasToken = typeof document !== 'undefined'
        ? document.cookie.includes('access_token')
        : false;

    return useQuery({
        queryKey: instituteKeys.config(),
        queryFn: instituteService.getConfig,
        staleTime: 5 * 60 * 1000, // 5 minutos
        retry: false,
        refetchOnWindowFocus: false,
        enabled: hasToken && options?.enabled !== false,
    });
}

/**
 * Hook para actualizar la configuración del instituto
 */
export function useUpdateInstituteConfig() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: UpdateInstituteDto) => instituteService.updateConfig(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: instituteKeys.config() });
            toast.success('Configuración actualizada exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error en la operación');
        },
    });
}

/**
 * Hook para subir logos (favicon y logo principal)
 */
export function useUploadLogos() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ favicon, logo }: { favicon?: File; logo?: File }) =>
            instituteService.uploadLogos(favicon, logo),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: instituteKeys.config() });
            toast.success('Logos actualizados exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error en la operación');
        },
    });
}

/**
 * Hook para actualizar colores del sistema
 */
export function useUpdateColors() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ primaryColor, secondaryColor }: { primaryColor: string; secondaryColor: string }) =>
            instituteService.updateColors(primaryColor, secondaryColor),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: instituteKeys.config() });
            toast.success('Colores actualizados exitosamente');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error en la operación');
        },
    });
}

/**
 * Hook para obtener la paleta de colores para materias
 */
export function useSubjectPalette() {
    return useQuery({
        queryKey: instituteKeys.palette(),
        queryFn: instituteService.getSubjectPalette,
        staleTime: 10 * 60 * 1000, // 10 minutos
    });
}

/**
 * Hook para agregar un color a la paleta
 */
export function useAddColorToPalette() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (color: string) => instituteService.addColorToPalette(color),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: instituteKeys.palette() });
            toast.success('Color agregado a la paleta');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error en la operación');
        },
    });
}

/**
 * Hook para eliminar un color de la paleta
 */
export function useRemoveColorFromPalette() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (index: number) => instituteService.removeColorFromPalette(index),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: instituteKeys.palette() });
            toast.success('Color eliminado de la paleta');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error en la operación');
        },
    });
}

/**
 * Hook para actualizar un color en la paleta
 */
export function useUpdateColorInPalette() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ index, color }: { index: number; color: string }) =>
            instituteService.updateColorInPalette(index, color),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: instituteKeys.palette() });
            toast.success('Color actualizado en la paleta');
        },
        onError: (error: Error) => {
            toast.error(error.message || 'Error en la operación');
        },
    });
}
