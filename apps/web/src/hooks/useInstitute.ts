import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instituteService, InstituteConfig, UpdateInstituteDto } from '@/services/institute.service';
import { toast } from 'sonner';
import { elLiceoDelHost } from '@/lib/el-liceo-de-la-direccion';

function getActiveTenantSlug(): string | null {
    if (typeof window === 'undefined') return null;
    // Ver `lib/el-liceo-de-la-direccion.ts`: una dirección de red (probar desde
    // el teléfono) no nombra a ningún liceo, y antes se leía como «192».
    const delHost = elLiceoDelHost(window.location.hostname);
    if (delHost) return delHost;

    // Si viene en parámetro de URL
    const params = new URLSearchParams(window.location.search);
    const slugParam = params.get('slug') || params.get('instituto') || params.get('institute');
    if (slugParam) return slugParam;

    return null;
}

// Query keys aisladas por inquilino
export const instituteKeys = {
    all: ['institute'] as const,
    config: (slug?: string | null) => [...instituteKeys.all, 'config', slug || 'none'] as const,
    palette: (slug?: string | null) => [...instituteKeys.all, 'palette', slug || 'none'] as const,
};

/**
 * Hook para obtener la configuración del instituto.
 * Se desactiva automáticamente si estamos en la Landing Page o fuera de un liceo.
 */
export function useInstituteConfig(options?: { enabled?: boolean; slug?: string }) {
    const slug = options?.slug || getActiveTenantSlug();
    return useQuery({
        queryKey: instituteKeys.config(slug),
        queryFn: instituteService.getConfig,
        staleTime: 5 * 60 * 1000, // 5 minutos
        retry: false,
        refetchOnWindowFocus: false,
        enabled: options?.enabled !== false && Boolean(slug),
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
