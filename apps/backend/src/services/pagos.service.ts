import { Prisma } from '@prisma/client';
import { AppErrors } from '../middleware/error.middleware';

/**
 * PAGOS: CUOTAS, DEUDA Y REPARTO
 *
 * Todo el dinero se cuenta en CÉNTIMOS enteros. Con decimales de coma flotante,
 * 0,1 + 0,2 no da 0,3, y en un año de cuotas esos restos acaban diciendo que un
 * alumno debe 0,01 $ que nunca debió.
 *
 * Las reglas (también en docs/MAPA_DE_CALCULOS.md, sección Pagos):
 *
 *   · Las CUOTAS del ciclo salen de la configuración y de las fechas del ciclo:
 *       - mensual: una por mes, del mes de inicio al mes de cierre;
 *       - quincenal: dos por mes, el día configurado y 15 días después;
 *       - por lapso: una por lapso, al empezar el lapso;
 *       - inscripción (si está activa): una, al empezar el ciclo.
 *     El día de vencimiento nunca cae antes del inicio del ciclo ni después del
 *     cierre, y en meses cortos se ajusta al último día.
 *   · Una cuota está VENCIDA cuando hoy (fecha del liceo) es posterior a su
 *     vencimiento más los días de gracia.
 *   · Un alumno DEBE si tiene alguna cuota vencida sin completar.
 *   · Exonerado: no debe nada, aunque tenga cuotas.
 *   · Un pago se reparte entre las cuotas elegidas, de la más vieja a la más
 *     nueva. Lo que no alcanza a completar la última queda como ABONO.
 *   · Un pago anulado no cuenta para nada.
 */

export type Frecuencia = 'MONTHLY' | 'BIWEEKLY' | 'PER_PERIOD';
export type ModoDeVencimiento = 'SAME_DAY' | 'PER_STUDENT';
export type Moneda = 'USD' | 'VES';
export type MonedasAceptadas = 'USD' | 'VES' | 'BOTH';

export const FRECUENCIAS: Frecuencia[] = ['MONTHLY', 'BIWEEKLY', 'PER_PERIOD'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface Configuracion {
    enabled: boolean;
    frequency: Frecuencia;
    dueMode: ModoDeVencimiento;
    dueDay: number;
    graceDays: number;
    baseCurrency: Moneda;
    acceptedCurrencies: MonedasAceptadas;
    feeCents: number;
    enrollmentEnabled: boolean;
    enrollmentCents: number;
    methods: string[];
}

export interface Cuota {
    key: string;
    label: string;
    dueDate: string;
    amountCents: number;
    kind: 'INSCRIPCION' | 'CUOTA';
}

export type EstadoDeCuota = 'PAGADA' | 'ABONADA' | 'VENCIDA' | 'PENDIENTE' | 'EXONERADA';
export type EstadoDelAlumno = 'AL_DIA' | 'DEBE' | 'ANO_PAGADO' | 'EXONERADO' | 'SIN_CUOTAS';

// ─── Dinero y fechas ─────────────────────────────────────────────────────────

export const aCentimos = (valor: Prisma.Decimal | number | string | null | undefined): number =>
    valor == null ? 0 : Math.round(Number(valor.toString()) * 100);

export const deCentimos = (c: number): string => (c / 100).toFixed(2);

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const diasDelMes = (anio: number, mes0: number) => new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate();
const fecha = (anio: number, mes0: number, dia: number) =>
    ymd(new Date(Date.UTC(anio, mes0, Math.min(dia, diasDelMes(anio, mes0)))));

export function sumarDias(ymdTexto: string, dias: number): string {
    const d = new Date(`${ymdTexto}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return ymd(d);
}

const encerrar = (f: string, desde: string, hasta: string) => (f < desde ? desde : f > hasta ? hasta : f);

// ─── Cuotas del ciclo ────────────────────────────────────────────────────────

export function cuotasDelCiclo(opciones: {
    config: Pick<Configuracion, 'frequency' | 'dueDay' | 'feeCents' | 'enrollmentEnabled' | 'enrollmentCents'>;
    inicio: Date | string;
    cierre: Date | string;
    lapsos?: Array<{ id: string; name: string; startDate: Date | string }>;
    diaDelAlumno?: number | null;
}): Cuota[] {
    const { config } = opciones;
    const inicio = typeof opciones.inicio === 'string' ? opciones.inicio.slice(0, 10) : ymd(opciones.inicio);
    const cierre = typeof opciones.cierre === 'string' ? opciones.cierre.slice(0, 10) : ymd(opciones.cierre);
    const dia = Math.min(28, Math.max(1, opciones.diaDelAlumno ?? config.dueDay));
    const cuotas: Cuota[] = [];

    if (config.enrollmentEnabled && config.enrollmentCents > 0) {
        cuotas.push({ key: 'INS', label: 'Inscripción', dueDate: inicio, amountCents: config.enrollmentCents, kind: 'INSCRIPCION' });
    }
    if (config.feeCents <= 0 || cierre < inicio) return cuotas;

    if (config.frequency === 'PER_PERIOD') {
        const lapsos = [...(opciones.lapsos ?? [])].sort((a, b) =>
            String(typeof a.startDate === 'string' ? a.startDate : ymd(a.startDate)).localeCompare(
                String(typeof b.startDate === 'string' ? b.startDate : ymd(b.startDate))
            )
        );
        for (const l of lapsos) {
            const empieza = typeof l.startDate === 'string' ? l.startDate.slice(0, 10) : ymd(l.startDate);
            cuotas.push({ key: `P:${l.id}`, label: l.name, dueDate: encerrar(empieza, inicio, cierre), amountCents: config.feeCents, kind: 'CUOTA' });
        }
        return cuotas;
    }

    let anio = Number(inicio.slice(0, 4));
    let mes0 = Number(inicio.slice(5, 7)) - 1;
    const anioFin = Number(cierre.slice(0, 4));
    const mesFin0 = Number(cierre.slice(5, 7)) - 1;

    while (anio < anioFin || (anio === anioFin && mes0 <= mesFin0)) {
        const clave = `${anio}-${String(mes0 + 1).padStart(2, '0')}`;
        const nombre = `${MESES[mes0]} ${anio}`;
        if (config.frequency === 'MONTHLY') {
            cuotas.push({ key: clave, label: nombre, dueDate: encerrar(fecha(anio, mes0, dia), inicio, cierre), amountCents: config.feeCents, kind: 'CUOTA' });
        } else {
            cuotas.push({ key: `${clave}-1`, label: `${nombre} · 1ª quincena`, dueDate: encerrar(fecha(anio, mes0, dia), inicio, cierre), amountCents: config.feeCents, kind: 'CUOTA' });
            cuotas.push({ key: `${clave}-2`, label: `${nombre} · 2ª quincena`, dueDate: encerrar(fecha(anio, mes0, dia + 15), inicio, cierre), amountCents: config.feeCents, kind: 'CUOTA' });
        }
        mes0++;
        if (mes0 === 12) {
            mes0 = 0;
            anio++;
        }
    }
    return cuotas;
}

// ─── Estado de un alumno ─────────────────────────────────────────────────────

export interface CuotaConEstado extends Cuota {
    paidCents: number;
    pendingCents: number;
    state: EstadoDeCuota;
}

export interface ResumenDelAlumno {
    state: EstadoDelAlumno;
    overdueCount: number;
    owedCents: number;
    paidCents: number;
    totalCents: number;
    cuotas: CuotaConEstado[];
}

export function estadoDelAlumno(opciones: {
    cuotas: Cuota[];
    pagadoPorCuota: Map<string, number>;
    hoy: string;
    graceDays: number;
    exento: boolean;
}): ResumenDelAlumno {
    const { cuotas, pagadoPorCuota, hoy, graceDays, exento } = opciones;
    let overdueCount = 0;
    let owedCents = 0;
    let paidCents = 0;
    let totalCents = 0;

    const conEstado = cuotas.map<CuotaConEstado>((c) => {
        const pagado = Math.min(c.amountCents, Math.max(0, pagadoPorCuota.get(c.key) ?? 0));
        const pendiente = c.amountCents - pagado;
        const vencida = hoy > sumarDias(c.dueDate, graceDays);
        totalCents += c.amountCents;
        paidCents += pagado;

        let state: EstadoDeCuota;
        if (exento) state = 'EXONERADA';
        else if (pendiente === 0) state = 'PAGADA';
        else if (vencida) state = 'VENCIDA';
        else if (pagado > 0) state = 'ABONADA';
        else state = 'PENDIENTE';

        if (state === 'VENCIDA') {
            overdueCount++;
            owedCents += pendiente;
        }
        return { ...c, paidCents: pagado, pendingCents: exento ? 0 : pendiente, state };
    });

    let state: EstadoDelAlumno;
    if (exento) state = 'EXONERADO';
    else if (cuotas.length === 0) state = 'SIN_CUOTAS';
    else if (paidCents === totalCents) state = 'ANO_PAGADO';
    else if (overdueCount > 0) state = 'DEBE';
    else state = 'AL_DIA';

    return { state, overdueCount, owedCents: exento ? 0 : owedCents, paidCents, totalCents, cuotas: conEstado };
}

/** Reparte un monto entre las cuotas elegidas, de la más vieja a la más nueva. */
export function repartir(
    montoCents: number,
    elegidas: CuotaConEstado[]
): Array<{ key: string; amountCents: number }> {
    const orden = [...elegidas].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
    const reparto: Array<{ key: string; amountCents: number }> = [];
    let queda = montoCents;
    for (const c of orden) {
        if (queda <= 0) break;
        const va = Math.min(queda, c.pendingCents);
        if (va > 0) {
            reparto.push({ key: c.key, amountCents: va });
            queda -= va;
        }
    }
    return reparto;
}

// ─── Configuración: leer y validar ───────────────────────────────────────────

export function configuracionDe(fila: any | null): Configuracion {
    const methods = Array.isArray(fila?.methods) ? (fila.methods as unknown[]).map(String) : ['Efectivo', 'Pago Móvil', 'Transferencia', 'Zelle'];
    return {
        enabled: Boolean(fila?.enabled),
        frequency: (fila?.frequency ?? 'MONTHLY') as Frecuencia,
        dueMode: (fila?.dueMode ?? 'SAME_DAY') as ModoDeVencimiento,
        dueDay: fila?.dueDay ?? 5,
        graceDays: fila?.graceDays ?? 0,
        baseCurrency: (fila?.baseCurrency ?? 'USD') as Moneda,
        acceptedCurrencies: (fila?.acceptedCurrencies ?? 'BOTH') as MonedasAceptadas,
        feeCents: aCentimos(fila?.feeAmount),
        enrollmentEnabled: Boolean(fila?.enrollmentEnabled),
        enrollmentCents: aCentimos(fila?.enrollmentAmount),
        methods,
    };
}

const MONTO_MAXIMO = 1_000_000_000; // 10 millones en céntimos: más es un error de tecleo

/** Valida lo que manda el admin. Devuelve los datos listos para guardar, o lanza 400. */
export function validarConfiguracion(e: any) {
    const mal = (m: string) => {
        throw AppErrors.BadRequest(m);
    };
    if (typeof e !== 'object' || e === null) mal('Configuración inválida');
    if (!FRECUENCIAS.includes(e.frequency)) mal('Frecuencia inválida');
    if (!['SAME_DAY', 'PER_STUDENT'].includes(e.dueMode)) mal('Modo de vencimiento inválido');
    if (!Number.isInteger(e.dueDay) || e.dueDay < 1 || e.dueDay > 28) mal('El día de pago debe estar entre 1 y 28');
    if (!Number.isInteger(e.graceDays) || e.graceDays < 0 || e.graceDays > 60) mal('Los días de gracia deben estar entre 0 y 60');
    if (!['USD', 'VES'].includes(e.baseCurrency)) mal('Moneda base inválida');
    if (!['USD', 'VES', 'BOTH'].includes(e.acceptedCurrencies)) mal('Monedas aceptadas inválidas');
    if (e.acceptedCurrencies !== 'BOTH' && e.acceptedCurrencies !== e.baseCurrency) {
        mal('Si solo se acepta una moneda, tiene que ser la moneda en que se fijan las cuotas');
    }
    const cuota = Math.round(Number(e.feeAmount) * 100);
    const inscripcion = Math.round(Number(e.enrollmentAmount ?? 0) * 100);
    if (!Number.isFinite(cuota) || cuota < 0 || cuota > MONTO_MAXIMO) mal('Monto de la cuota inválido');
    if (!Number.isFinite(inscripcion) || inscripcion < 0 || inscripcion > MONTO_MAXIMO) mal('Monto de la inscripción inválido');
    if (typeof e.enabled !== 'boolean' || typeof e.enrollmentEnabled !== 'boolean') mal('Configuración inválida');

    const metodos = Array.isArray(e.methods)
        ? [...new Set(e.methods.map((m: unknown) => String(m ?? '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()).filter((m: string) => m.length >= 2 && m.length <= 30))]
        : [];
    if (metodos.length === 0 || metodos.length > 12) mal('Indica entre 1 y 12 métodos de pago');

    return {
        enabled: e.enabled,
        frequency: e.frequency,
        dueMode: e.dueMode,
        dueDay: e.dueDay,
        graceDays: e.graceDays,
        baseCurrency: e.baseCurrency,
        acceptedCurrencies: e.acceptedCurrencies,
        feeAmount: deCentimos(cuota),
        enrollmentEnabled: e.enrollmentEnabled,
        enrollmentAmount: deCentimos(inscripcion),
        methods: metodos as string[],
    };
}

/** Pasa un monto a la moneda base con la tasa (bolívares por dólar). */
export function aMonedaBase(montoCents: number, moneda: Moneda, base: Moneda, tasa: number | null): number {
    if (moneda === base) return montoCents;
    if (!tasa || !(tasa > 0)) throw AppErrors.BadRequest('Falta la tasa de cambio (bolívares por dólar)');
    return base === 'USD' ? Math.round(montoCents / tasa) : Math.round(montoCents * tasa);
}
