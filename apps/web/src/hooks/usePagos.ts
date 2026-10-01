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
    /** Descuento automático desde el 2.º hijo del mismo representante (0–100). */
    descuentoHermanosPct?: number;
    moraTipo?: 'NINGUNA' | 'FIJA' | 'PORCENTAJE';
    moraValor?: string;
    moraDiasDespues?: number;
    recordatorioDiasAntes?: number;
    /** El ciclo cuya configuración se ve y se edita (el que está en curso). */
    cicloEnCurso?: { id: string; name: string } | null;
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
    /** Sus cuotas sin pagar, con su estado: para «quién debe este mes». */
    cuotas?: Record<string, EstadoDeCuota>;
}

/** Un mes del ciclo: lo esperado, lo cobrado y cuántos deben. */
export interface MesDelCiclo {
    month: string;
    expected: string;
    collected: string;
    overdue: number;
    upcoming: number;
    debtors: number;
}

export interface ResumenDePagos {
    academicYear: { id: string; name: string; startDate: string; endDate: string; status?: string };
    closed?: boolean;
    today: string;
    currency: Moneda;
    summary: { students: number; debtors: number; owed: string; collected: string };
    installments?: Array<{ key: string; label: string; dueDate: string; amount: string }>;
    months?: MesDelCiclo[];
    classrooms: Array<{ id: string; name: string; grade: number; section: string; debtors: number; students: AlumnoEnResumen[] }>;
}

export interface CicloDePagos {
    id: string;
    name: string;
    status: 'ACTIVE' | 'COMPLETED' | 'UPCOMING';
    startDate: string;
    endDate: string;
    closed: boolean;
    payments: number;
}

/** Un mes en días: qué vence cada día y quién pagó. */
export interface DiaDePagos {
    date: string;
    due: number;
    pendingOfDue: string;
    debtors: Array<{ id: string; nombre: string; falta: string }>;
    payments: Array<{ id: string; receiptNumber: number; method: string; amount: string; student: { id: string; nombre: string } }>;
    collected: string;
}
export interface MesDePagos {
    academicYear: { id: string; name: string };
    currency: Moneda;
    month: string;
    today: string;
    days: DiaDePagos[];
}

export interface Cuota {
    key: string;
    label: string;
    kind: 'INSCRIPCION' | 'CUOTA';
    dueDate: string;
    overdueFrom: string;
    amount: string;
    /** Lo que valía antes de la beca o el descuento de hermanos. */
    fullAmount?: string | null;
    /** El recargo por mora, ya sumado en `amount`. */
    lateFee?: string | null;
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
    /** Ciclo cerrado: se ve, no se toca (el servidor responde 409 CICLO_CERRADO). */
    closed?: boolean;
    currency: Moneda;
    acceptedCurrencies: Moneda | 'BOTH';
    dueMode: 'SAME_DAY' | 'PER_STUDENT';
    methods?: string[];
    plan: { dueDay: number | null; exempt: boolean; exemptReason: string | null; descuentoPct: number; descuentoMotivo: string | null; hermano: number };
    summary: ResumenDinero;
    installments: Cuota[];
    payments: PagoRegistrado[];
    /** Lo que el representante dijo que pagó (con la captura), y cómo va. */
    reports?: PagoReportadoEnFicha[];
}

export interface PagoReportadoEnFicha {
    id: string;
    estado: 'PENDIENTE' | 'CONFIRMANDO' | 'CONFIRMADO' | 'RECHAZADO';
    monto: string;
    moneda: Moneda;
    metodo: string;
    referencia: string | null;
    fechaDePago: string;
    cuotas: string[];
    motivoRechazo: string | null;
    conCaptura: boolean;
}

export interface PagoPorConfirmar {
    id: string;
    alumno: { id: string; nombre: string };
    representante: string;
    monto: string;
    moneda: Moneda;
    tasa: string | null;
    metodo: string;
    referencia: string | null;
    fechaDePago: string;
    installmentKeys: string[];
    conCaptura: boolean;
    createdAt: string;
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

/** `ciclo` vacío = el que está en curso. */
const delCiclo = (ciclo?: string | null) => (ciclo ? { academicYearId: ciclo } : undefined);

export function useResumenDePagos(activo: boolean, ciclo?: string | null) {
    return useQuery({
        queryKey: ['pagos', 'overview', ciclo ?? 'actual'],
        queryFn: async () => (await api.get('/payments/overview', { params: delCiclo(ciclo) })).data as ResumenDePagos,
        enabled: activo,
    });
}

/** Los ciclos escolares, para elegir cuál mirar (también los ya cerrados). */
export function useCiclosDePagos(activo: boolean) {
    return useQuery({
        queryKey: ['pagos', 'ciclos'],
        queryFn: async () => (await api.get('/payments/cycles')).data.cycles as CicloDePagos[],
        enabled: activo,
        staleTime: 5 * 60_000,
    });
}

/** Un mes en días (`mes` = AAAA-MM). */
export function useMesDePagos(ciclo: string | null | undefined, mes: string | null) {
    return useQuery({
        queryKey: ['pagos', 'mes', ciclo ?? 'actual', mes],
        queryFn: async () => (await api.get('/payments/month', { params: { ...delCiclo(ciclo), month: mes } })).data as MesDePagos,
        enabled: !!mes,
    });
}

export function useFichaDePagos(studentId: string | null, ciclo?: string | null) {
    return useQuery({
        queryKey: ['pagos', 'alumno', studentId, ciclo ?? 'actual'],
        queryFn: async () =>
            (await api.get(`/payments/students/${encodeURIComponent(studentId!)}`, { params: delCiclo(ciclo) })).data as FichaDePagos,
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
            academicYearId?: string;
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

export function useGuardarPlanDePago(studentId: string, ciclo?: string | null) {
    const invalidar = useInvalidarPagos();
    return useMutation({
        mutationFn: async (datos: { dueDay: number | null; exempt: boolean; exemptReason: string | null; descuentoPct?: number; descuentoMotivo?: string | null }) =>
            (await api.put(`/payments/students/${encodeURIComponent(studentId)}/plan`, datos, { params: delCiclo(ciclo) })).data,
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

// ─── Reportar y confirmar (2026-10-01) ───────────────────────────────────────

/** Sube la captura del pago (el representante o el admin); devuelve su id. */
export async function subirCaptura(archivo: File): Promise<string> {
    const datos = new FormData();
    datos.append('file', archivo);
    const r = await api.post('/payments/comprobantes', datos, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data.comprobante.id as string;
}

/** Abre la captura de un pago reportado en otra pestaña (va con la sesión, no por enlace). */
export async function verCaptura(reporteId: string) {
    const r = await api.get(`/payments/reportes/${encodeURIComponent(reporteId)}/captura`, { responseType: 'blob' });
    window.open(URL.createObjectURL(r.data as Blob), '_blank', 'noopener');
}

export function useReportarPago(studentId: string) {
    const invalidar = useInvalidarPagos();
    return useMutation({
        mutationFn: async (datos: {
            installmentKeys: string[];
            amount: string;
            currency: Moneda;
            exchangeRate?: string | null;
            method: string;
            reference?: string | null;
            paidAt: string;
            comprobanteId?: string | null;
        }) => (await api.post(`/payments/students/${encodeURIComponent(studentId)}/reportes`, datos)).data.reporte as { id: string },
        onSuccess: invalidar,
    });
}

export function usePagosPorConfirmar(activo: boolean) {
    return useQuery({
        queryKey: ['pagos', 'reportes'],
        queryFn: async () => (await api.get('/payments/reportes')).data.reportes as PagoPorConfirmar[],
        enabled: activo,
    });
}

export function useConfirmarReporte() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => (await api.post(`/payments/reportes/${encodeURIComponent(id)}/confirmar`, {})).data.payment as { id: string; receiptNumber: number },
        onSuccess: () => {
            cola.invalidateQueries({ queryKey: ['pagos'] });
            cola.invalidateQueries({ queryKey: ['finanzas'] });
        },
    });
}

export function useRechazarReporte() {
    const cola = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => (await api.post(`/payments/reportes/${encodeURIComponent(id)}/rechazar`, { motivo })).data,
        onSuccess: () => {
            cola.invalidateQueries({ queryKey: ['pagos'] });
            cola.invalidateQueries({ queryKey: ['finanzas'] });
        },
    });
}
