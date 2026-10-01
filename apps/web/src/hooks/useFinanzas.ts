import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';
import type { Moneda } from '@/hooks/usePagos';
import { hacerODejarPendiente } from '@/lib/por-enviar';

/**
 * LAS FINANZAS DEL LICEO (2026-10-01): tipos y llamadas. Las reglas viven en el
 * servidor (`controllers/finanzas.controller.ts`, `services/finanzas.service.ts`).
 */

export type FrecuenciaDelPersonal = 'UNICO' | 'MENSUAL' | 'QUINCENAL';
export type EstadoDePagoAlPersonal = 'PAGADO' | 'ABONADO' | 'VENCIDO' | 'PENDIENTE';

export interface ResumenDeFinanzas {
    academicYear: { id: string; name: string; startDate: string; endDate: string; status: string };
    closed: boolean;
    today: string;
    currency: Moneda;
    fondosDisponibles: string;
    tieneSaldoInicial: boolean;
    alumnos: { deben: string; deudores: number; porCobrar: string; cobrado: string };
    personal: { porPagar: string; vencido: string; sinSueldo: number; personas: number };
    gastos: { delCiclo: string; porCategoria: Array<{ categoria: string; monto: string }> };
    pagosPorConfirmar: number;
    months: Array<{ month: string; in: string; out: string; expenses: string; toCollect: string; toPay: string }>;
}

export interface MesDeFinanzas {
    month: string;
    today: string;
    days: Array<{
        date: string;
        fondos: Array<{ id: string; concepto: string; descripcion: string | null; monto: string }>;
        gastos: Array<{ id: string; concepto: string; categoria: string; monto: string; conFactura: boolean }>;
        pagados: Array<{ id: string; numero: number; persona: string; personalId: string; monto: string }>;
        tocaPagar: Array<{ personalId: string; persona: string; etiqueta: string; falta: string; estado: EstadoDePagoAlPersonal }>;
    }>;
}

export interface Acuerdo {
    monto: string;
    frecuencia: FrecuenciaDelPersonal;
    diaDePago: number | null;
    fechaUnica: string | null;
    cobraEnVacaciones: boolean | null;
    bonoVacacional: string | null;
    fechaBono: string | null;
}

export interface Nomina {
    diaDePago: number;
    mesesDeVacaciones: string[];
    cobraEnVacaciones: boolean;
    bonoVacacional: string;
    fechaBono: string | null;
    guardada: boolean;
}

export interface PersonaDelPersonal {
    id: string;
    nombre: string;
    cedula: string | null;
    cargo: string;
    conCuenta: boolean;
    activo: boolean;
    seQuedaParaProximosCiclos: boolean;
    notas: string | null;
    acuerdo: Acuerdo | null;
    resumen: {
        total: string;
        pagado: string;
        pendiente: string;
        vencido: string;
        proximo: { clave: string; etiqueta: string; fecha: string; falta: string } | null;
    } | null;
}

export interface ListaDelPersonal {
    academicYear: { id: string; name: string; startDate: string; endDate: string };
    closed: boolean;
    currency: Moneda;
    methods: string[];
    nomina: Nomina;
    traidos: { traidos: number; desde: string | null };
    personas: PersonaDelPersonal[];
}

export interface PagoDebido {
    clave: string;
    etiqueta: string;
    fecha: string;
    tipo: 'SUELDO' | 'BONO' | 'UNICO';
    vacaciones: boolean;
    monto: string;
    pagado: string;
    pendiente: string;
    estado: EstadoDePagoAlPersonal;
}

export interface FichaDePersonal {
    academicYear: { id: string; name: string };
    closed: boolean;
    currency: Moneda;
    methods: string[];
    acceptedCurrencies: Moneda | 'BOTH';
    nomina: Nomina;
    persona: PersonaDelPersonal;
    debidos: PagoDebido[];
    pagos: Array<{
        id: string;
        numero: number;
        fecha: string;
        metodo: string;
        referencia: string | null;
        moneda: Moneda;
        monto: string;
        montoBase: string;
        anulado: boolean;
        motivoAnulacion: string | null;
        asignaciones: Array<{ clave: string; etiqueta: string; monto: string }>;
    }>;
}

export interface MisPagos {
    tiene: boolean;
    academicYear?: { id: string; name: string; startDate: string; endDate: string };
    currency?: Moneda;
    nomina?: { mesesDeVacaciones: string[] };
    persona?: { nombre: string; cargo: string; acuerdo: Acuerdo | null; resumen: PersonaDelPersonal['resumen'] };
    debidos?: PagoDebido[];
    pagos?: Array<{ id: string; numero: number; fecha: string; metodo: string; montoBase: string; asignaciones: Array<{ etiqueta: string; monto: string }> }>;
}

export interface Fondo {
    id: string;
    fecha: string;
    concepto: 'SALDO_INICIAL' | 'DONACION' | 'OTRO';
    descripcion: string | null;
    moneda: Moneda;
    monto: string;
    tasa: string | null;
    montoBase: string;
    anuladoEn: string | null;
    motivoAnulacion: string | null;
}

export interface Gasto {
    id: string;
    fecha: string;
    concepto: string;
    categoria: string;
    proveedor: string | null;
    notas: string | null;
    moneda: Moneda;
    monto: string;
    tasa: string | null;
    montoBase: string;
    comprobanteId: string | null;
    anuladoEn: string | null;
    motivoAnulacion: string | null;
}

export const CONCEPTO_DE_FONDO: Record<Fondo['concepto'], string> = {
    SALDO_INICIAL: 'Saldo inicial',
    DONACION: 'Donación',
    OTRO: 'Otro ingreso',
};

export const ESTADO_DE_PAGO_AL_PERSONAL: Record<EstadoDePagoAlPersonal, { texto: string; clases: string }> = {
    PAGADO: { texto: 'Pagado', clases: 'bg-emerald-50 text-emerald-800' },
    ABONADO: { texto: 'Abonado', clases: 'bg-sky-50 text-sky-800' },
    VENCIDO: { texto: 'Atrasado', clases: 'bg-red-50 text-red-800' },
    PENDIENTE: { texto: 'Por pagar', clases: 'bg-gray-100 text-gray-700' },
};

export const FRECUENCIA: Record<FrecuenciaDelPersonal, string> = { UNICO: 'Pago único', MENSUAL: 'Mensual', QUINCENAL: 'Quincenal' };

const delCiclo = (ciclo?: string | null) => (ciclo ? { academicYearId: ciclo } : undefined);

export function useResumenDeFinanzas(activo: boolean, ciclo: string | null) {
    return useQuery({
        queryKey: ['finanzas', 'resumen', ciclo ?? 'actual'],
        queryFn: async () => (await api.get('/finanzas/resumen', { params: delCiclo(ciclo) })).data as ResumenDeFinanzas,
        enabled: activo,
    });
}

export function useMesDeFinanzas(ciclo: string | null, mes: string | null) {
    return useQuery({
        queryKey: ['finanzas', 'mes', ciclo ?? 'actual', mes],
        queryFn: async () => (await api.get('/finanzas/mes', { params: { ...delCiclo(ciclo), mes } })).data as MesDeFinanzas,
        enabled: !!mes,
    });
}

export function usePersonal(activo: boolean, ciclo: string | null) {
    return useQuery({
        queryKey: ['finanzas', 'personal', ciclo ?? 'actual'],
        queryFn: async () => (await api.get('/finanzas/personal', { params: delCiclo(ciclo) })).data as ListaDelPersonal,
        enabled: activo,
    });
}

export function useFichaDePersonal(id: string | null, ciclo: string | null) {
    return useQuery({
        queryKey: ['finanzas', 'persona', id, ciclo ?? 'actual'],
        queryFn: async () => (await api.get(`/finanzas/personal/${encodeURIComponent(id!)}`, { params: delCiclo(ciclo) })).data as FichaDePersonal,
        enabled: !!id,
    });
}

export function useGastos(activo: boolean, ciclo: string | null) {
    return useQuery({
        queryKey: ['finanzas', 'gastos', ciclo ?? 'actual'],
        queryFn: async () => (await api.get('/finanzas/gastos', { params: delCiclo(ciclo) })).data as { categorias: string[]; gastos: Gasto[] },
        enabled: activo,
    });
}

export function useFondos(activo: boolean, ciclo: string | null) {
    return useQuery({
        queryKey: ['finanzas', 'fondos', ciclo ?? 'actual'],
        queryFn: async () => (await api.get('/finanzas/fondos', { params: delCiclo(ciclo) })).data.fondos as Fondo[],
        enabled: activo,
    });
}

export function useMisPagos(activo: boolean) {
    return useQuery({
        queryKey: ['finanzas', 'mis-pagos'],
        queryFn: async () => (await api.get('/finanzas/mis-pagos')).data as MisPagos,
        enabled: activo,
    });
}

/** Cualquier cambio de dinero refresca todo lo de finanzas y de pagos (el saldo es uno). */
function useCambio<T, R = any>(hacer: (datos: T) => Promise<R>) {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: hacer,
        onSuccess: () => {
            void cola.invalidateQueries({ queryKey: ['finanzas'] });
            void cola.invalidateQueries({ queryKey: ['pagos'] });
        },
    });
}

// Sin conexión, un fondo o un gasto (sin foto) quedan pendientes (⏱) y suben
// solos al volver (`lib/por-enviar.ts`); el servidor no los anota dos veces.
export const useCrearFondo = () =>
    useCambio((d: Record<string, unknown>) =>
        hacerODejarPendiente(async () => (await api.post('/finanzas/fondos', d)).data, {
            tipo: 'otro',
            grupo: 2,
            metodo: 'post',
            url: '/finanzas/fondos',
            objeto: `fondo|${crypto.randomUUID()}`,
            resumen: `Fondos: ${String(d.monto)} (${String(d.concepto).toLowerCase().replace('_', ' ')})`,
            datos: d,
        })
    );
export const useAnularFondo = () => useCambio(({ id, motivo }: { id: string; motivo: string }) => api.post(`/finanzas/fondos/${id}/anular`, { motivo }).then((r) => r.data));
export const useCrearGasto = () =>
    useCambio((d: Record<string, unknown>) =>
        hacerODejarPendiente(async () => (await api.post('/finanzas/gastos', d)).data, {
            tipo: 'otro',
            grupo: 2,
            metodo: 'post',
            url: '/finanzas/gastos',
            objeto: `gasto|${crypto.randomUUID()}`,
            resumen: `Gasto: ${String(d.concepto)} (${String(d.monto)})`,
            datos: d,
        })
    );
export const useAnularGasto = () => useCambio(({ id, motivo }: { id: string; motivo: string }) => api.post(`/finanzas/gastos/${id}/anular`, { motivo }).then((r) => r.data));
export const useGuardarCategorias = () => useCambio((categorias: string[]) => api.put('/finanzas/categorias', { categorias }).then((r) => r.data));
export const useCrearPersona = () => useCambio((d: Record<string, unknown>) => api.post('/finanzas/personal', d).then((r) => r.data));
export const useEditarPersona = () => useCambio(({ id, ...d }: { id: string } & Record<string, unknown>) => api.put(`/finanzas/personal/${id}`, d).then((r) => r.data));
export const useGuardarAcuerdo = (ciclo: string | null) =>
    useCambio(({ id, ...d }: { id: string } & Record<string, unknown>) => api.put(`/finanzas/personal/${id}/acuerdo`, d, { params: delCiclo(ciclo) }).then((r) => r.data));
export const useGuardarNomina = (ciclo: string | null) => useCambio((d: Record<string, unknown>) => api.put('/finanzas/nomina', d, { params: delCiclo(ciclo) }).then((r) => r.data));
export const useAplicarATodos = (ciclo: string | null) =>
    useCambio((d: Record<string, unknown>) => api.post('/finanzas/nomina/a-todos', d, { params: delCiclo(ciclo) }).then((r) => r.data as { aplicados: number; saltados: number }));
export const usePagarAlPersonal = (ciclo: string | null) =>
    useCambio(({ id, ...d }: { id: string } & Record<string, unknown>) =>
        api.post(`/finanzas/personal/${id}/pagos`, d, { params: delCiclo(ciclo) }).then((r) => r.data.pago as { id: string; numero: number })
    );
export const useAnularPagoAlPersonal = () =>
    useCambio(({ id, motivo }: { id: string; motivo: string }) => api.post(`/finanzas/pagos-al-personal/${id}/anular`, { motivo }).then((r) => r.data));

/** Sube la foto de una factura; devuelve su id. */
export async function subirComprobante(archivo: File): Promise<string> {
    const datos = new FormData();
    datos.append('file', archivo);
    const r = await api.post('/finanzas/comprobantes', datos, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data.comprobante.id as string;
}
