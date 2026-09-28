import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

/**
 * EL COMEDOR (PAE): `/api/pae`, solo el admin (`services/pae.service.ts`).
 * Apagado, lo del mes responde 403 y el menú no lo ofrece.
 */
export const COMIDAS: Record<string, string> = { DESAYUNO: 'Desayuno', ALMUERZO: 'Almuerzo', MERIENDA: 'Merienda', CENA: 'Cena' };

export interface ConfigDelComedor {
    enabled: boolean;
    comidas: string[];
}
export interface RegistroDelComedor {
    fecha: string;
    comida: string;
    recibidas: number;
    servidas: number;
    menu: string | null;
    observaciones: string | null;
}
export interface MesDelComedor {
    mes: string;
    comidas: string[];
    registros: RegistroDelComedor[];
    resumen: {
        diasServidos: number;
        recibidas: number;
        servidas: number;
        diferencia: number;
        porComida: Array<{ comida: string; dias: number; recibidas: number; servidas: number; diferencia: number }>;
    };
}

/** ¿El liceo tiene el comedor activo? Solo lo pregunta el admin (el menú). */
export function usePaeActivo(esAdmin: boolean) {
    return useQuery({
        queryKey: ['pae', 'config'],
        queryFn: async () => (await api.get('/pae/config')).data.data as ConfigDelComedor,
        enabled: esAdmin,
        staleTime: 5 * 60_000,
    });
}

export function useGuardarConfigDelComedor() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async (c: ConfigDelComedor) => (await api.put('/pae/config', c)).data.data as ConfigDelComedor,
        onSuccess: (c) => {
            cola.setQueryData(['pae', 'config'], c);
            void cola.invalidateQueries({ queryKey: ['pae'] });
        },
    });
}

export function useMesDelComedor(mes: string) {
    return useQuery({
        queryKey: ['pae', 'mes', mes],
        queryFn: async () => (await api.get('/pae/registros', { params: { mes } })).data.data as MesDelComedor,
        enabled: /^\d{4}-\d{2}$/.test(mes),
    });
}

export function useAnotarElComedor() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async (r: { fecha: string; comida: string; recibidas: number; servidas: number; menu?: string; observaciones?: string }) =>
            (
                await api.put(`/pae/registros/${r.fecha}/${r.comida}`, {
                    recibidas: r.recibidas,
                    servidas: r.servidas,
                    menu: r.menu || null,
                    observaciones: r.observaciones || null,
                })
            ).data.data as { registro: RegistroDelComedor; aviso: string | null },
        onSuccess: () => cola.invalidateQueries({ queryKey: ['pae', 'mes'] }),
    });
}

export function useBorrarDelComedor() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async (r: { fecha: string; comida: string }) => (await api.delete(`/pae/registros/${r.fecha}/${r.comida}`)).data,
        onSuccess: () => cola.invalidateQueries({ queryKey: ['pae', 'mes'] }),
    });
}
