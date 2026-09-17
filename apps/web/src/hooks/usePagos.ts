import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

/** Tipos y llamadas del control de pagos. Las reglas viven en el servidor. */

export type Frecuencia = 'MONTHLY' | 'BIWEEKLY' | 'PER_PERIOD';
export type Moneda = 'USD' | 'VES';
export type EstadoDelAlumno = 'AL_DIA' | 'DEBE' | 'ANO_PAGADO' | 'EXONERADO' | 'SIN_CUOTAS';
export type EstadoDeCuota = 'PAGADA' | 'ABONADA' | 'VENCIDA' | 'PENDIENTE' | 'EXONERADA';

export interface ConfiguracionDePagos {
    enabled: boolean;
    frequency: Frecuencia;
    dueMode: 'SAME_DAY' | 'PER_STUDENT';
    dueDay: number;
    graceDays: number;
    baseCurrency: Moneda;
    acceptedCurrencies: Moneda | 'BOTH';
    feeAmount: string;
    enrollmentEnabled: boolean;
    enrollmentAmount: string;
    methods: string[];
}

export interface ResumenDinero {
    state: EstadoDelAlumno;
    overdueCount: number;
    owed: string;
    paid: string;
    total: string;
}

export interface AlumnoEnResumen extends ResumenDinero {
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
}

export interface ResumenDePagos {
    academicYear: { id: string; name: string };
    today: string;
    currency: Moneda;
    summary: { students: number; debtors: number; owed: string; collected: string };
    classrooms: Array<{ id: string; name: string; grade: number; section: string; debtors: number; students: AlumnoEnResumen[] }>;
}

export interface Cuota {
    key: string;
    label: string;
    kind: 'INSCRIPCION' | 'CUOTA';
    dueDate: string;
    overdueFrom: string;
    amount: string;
    paid: string;
    pending: string;
    state: EstadoDeCuota;
}

export interface PagoRegistrado {
    id: string;
    receiptNumber: number;
    paidAt: string;
    method: string;
    reference: string | null;
    notes: string | null;
    currency: Moneda;
    amount: string;
    exchangeRate: string | null;
    amountBase: string;
    annulledAt: string | null;
    annulReason: string | null;
    allocations: Array<{ key: string; label: string; amount: string }>;
}

export interface FichaDePagos {
    student: { id: string; firstName: string; lastName: string; avatar: string | null; classroom: { id: string; name: string } | null };
    academicYear: { id: string; name: string };
    currency: Moneda;
    acceptedCurrencies: Moneda | 'BOTH';
    dueMode: 'SAME_DAY' | 'PER_STUDENT';
    methods?: string[];
    plan: { dueDay: number | null; exempt: boolean; exemptReason: string | null };
    summary: ResumenDinero;
    installments: Cuota[];
    payments: PagoRegistrado[];
}

export const errorDe = (e: any, porDefecto: string) => e?.response?.data?.error || porDefecto;

export function usePagosActivos() {
    return useQuery({
        queryKey: ['pagos', 'settings'],
        queryFn: async () => (await api.get('/payments/settings')).data as Partial<ConfiguracionDePagos> & { enabled: boolean },
        staleTime: 5 * 60_000,
    });
}

export function useGuardarConfiguracionDePagos() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async (datos: Omit<ConfiguracionDePagos, 'feeAmount' | 'enrollmentAmount'> & { feeAmount: number | string; enrollmentAmount: number | string }) =>
            (await api.put('/payments/settings', datos)).data as ConfiguracionDePagos,
        onSuccess: () => cola.invalidateQueries({ queryKey: ['pagos'] }),
    });
}

export function useResumenDePagos(activo: boolean) {
    return useQuery({
        queryKey: ['pagos', 'overview'],
        queryFn: async () => (await api.get('/payments/overview')).data as ResumenDePagos,
        enabled: activo,
    });
}

export function useFichaDePagos(studentId: string | null) {
    return useQuery({
        queryKey: ['pagos', 'alumno', studentId],
        queryFn: async () => (await api.get(`/payments/students/${encodeURIComponent(studentId!)}`)).data as FichaDePagos,
        enabled: !!studentId,
    });
}

export function usePagosDeMisRepresentados(activo: boolean) {
    return useQuery({
        queryKey: ['pagos', 'mis-representados'],
        queryFn: async () => (await api.get('/payments/my-children')).data.children as FichaDePagos[],
        enabled: activo,
    });
}

function useInvalidarPagos() {
    const cola = useQueryClient();
    return () => cola.invalidateQueries({ queryKey: ['pagos'] });
}

export function useRegistrarPago(studentId: string) {
    const invalidar = useInvalidarPagos();
    return useMutation({
        mutationFn: async (datos: {
            installmentKeys: string[];
            amount: string;
            currency: Moneda;
            exchangeRate?: string | null;
            method: string;
            reference?: string | null;
            notes?: string | null;
            paidAt: string;
        }) => (await api.post(`/payments/students/${encodeURIComponent(studentId)}/payments`, datos)).data.payment as { id: string; receiptNumber: number },
        onSuccess: invalidar,
    });
}

export function useAnularPago() {
    const invalidar = useInvalidarPagos();
    return useMutation({
        mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) =>
            (await api.post(`/payments/${paymentId}/annul`, { reason })).data,
        onSuccess: invalidar,
    });
}

export function useGuardarPlanDePago(studentId: string) {
    const invalidar = useInvalidarPagos();
    return useMutation({
        mutationFn: async (datos: { dueDay: number | null; exempt: boolean; exemptReason: string | null }) =>
            (await api.put(`/payments/students/${encodeURIComponent(studentId)}/plan`, datos)).data,
        onSuccess: invalidar,
    });
}

/** "1234.5" + USD → "$1.234,50";  VES → "Bs 1.234,50" */
export function dinero(valor: string | number, moneda: Moneda): string {
    const n = Number(valor);
    const texto = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
    return moneda === 'USD' ? `$${texto}` : `Bs ${texto}`;
}

export const ESTADO_DEL_ALUMNO: Record<EstadoDelAlumno, { texto: string; clases: string }> = {
    DEBE: { texto: 'Debe', clases: 'bg-red-50 text-red-800 border-red-200' },
    AL_DIA: { texto: 'Al día', clases: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    ANO_PAGADO: { texto: 'Año pagado', clases: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    EXONERADO: { texto: 'Exonerado', clases: 'bg-amber-50 text-amber-900 border-amber-200' },
    SIN_CUOTAS: { texto: 'Sin cuotas', clases: 'bg-gray-50 text-gray-700 border-gray-200' },
};

export const ESTADO_DE_CUOTA: Record<EstadoDeCuota, { texto: string; clases: string }> = {
    PAGADA: { texto: 'Pagada', clases: 'bg-emerald-50 text-emerald-800' },
    ABONADA: { texto: 'Abonada', clases: 'bg-sky-50 text-sky-800' },
    VENCIDA: { texto: 'Vencida', clases: 'bg-red-50 text-red-800' },
    PENDIENTE: { texto: 'Por vencer', clases: 'bg-gray-100 text-gray-700' },
    EXONERADA: { texto: 'Exonerada', clases: 'bg-amber-50 text-amber-900' },
};
