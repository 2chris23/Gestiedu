import { AppErrors } from '../middleware/error.middleware';
import { sumarDias } from './pagos.service';

/**
 * LAS FINANZAS DEL LICEO: LAS CUENTAS (2026-10-01)
 *
 * Cristian pidió manejar en el sistema lo que el liceo paga: profesores y otro
 * personal (con su fecha de pago, para todos o para cada uno, y sus
 * vacaciones), además de los gastos y los fondos. Aquí las cuentas puras, sin
 * base de datos; las reglas, también en docs/MAPA_DE_CALCULOS.md §8g.
 *
 *   · Lo acordado con cada persona por ciclo (`AcuerdoDePago`): el monto de
 *     CADA pago y su frecuencia.
 *       - MENSUAL: un pago por mes del ciclo, el día acordado (o el del liceo);
 *         un día que el mes no tiene (31 en septiembre) es el último del mes.
 *       - QUINCENAL: dos por mes, el 15 y el último día.
 *       - UNICO: uno, en su fecha.
 *   · Vacaciones: los meses que el liceo marque. Si la persona NO cobra en
 *     vacaciones, esos meses no tienen pago. Lo que la persona no tiene
 *     propio, lo toma del liceo (`AjustesDeNomina`).
 *   · Bono vacacional: si hay monto (de la persona o del liceo), un pago más en
 *     su fecha (la de la persona, la del liceo o el día 1 del primer mes de
 *     vacaciones).
 *   · Un pago está VENCIDO cuando hoy es posterior a su fecha y falta algo.
 *   · Lo que se le paga se reparte de lo más viejo a lo más nuevo; lo que no
 *     completa el último queda como abono. Un pago anulado no cuenta.
 */

export type Frecuencia = 'UNICO' | 'MENSUAL' | 'QUINCENAL';
export const FRECUENCIAS_DEL_PERSONAL: Frecuencia[] = ['UNICO', 'MENSUAL', 'QUINCENAL'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface Acuerdo {
    montoCents: number;
    frecuencia: Frecuencia;
    diaDePago: number | null;
    fechaUnica: string | null;
    cobraEnVacaciones: boolean | null;
    bonoCents: number | null;
    fechaBono: string | null;
}

export interface Nomina {
    diaDePago: number;
    mesesDeVacaciones: string[];
    cobraEnVacaciones: boolean;
    bonoCents: number;
    fechaBono: string | null;
}

export interface PagoDebido {
    clave: string;
    etiqueta: string;
    fecha: string;
    montoCents: number;
    tipo: 'SUELDO' | 'BONO' | 'UNICO';
    /** Cae en un mes de vacaciones. */
    vacaciones: boolean;
}

export type EstadoDePago = 'PAGADO' | 'ABONADO' | 'VENCIDO' | 'PENDIENTE';

export interface PagoDebidoConEstado extends PagoDebido {
    pagadoCents: number;
    pendienteCents: number;
    estado: EstadoDePago;
}

const dos = (n: number) => String(n).padStart(2, '0');
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const fecha = (a: number, m: number, d: number) => `${a}-${dos(m)}-${dos(Math.min(d, diasDelMes(a, m)))}`;

/** Los meses del ciclo, «AAAA-MM», del de inicio al de cierre. */
export function mesesEntre(inicio: string, cierre: string): string[] {
    let a = Number(inicio.slice(0, 4));
    let m = Number(inicio.slice(5, 7));
    const af = Number(cierre.slice(0, 4));
    const mf = Number(cierre.slice(5, 7));
    const meses: string[] = [];
    while ((a < af || (a === af && m <= mf)) && meses.length < 36) {
        meses.push(`${a}-${dos(m)}`);
        m++;
        if (m === 13) {
            m = 1;
            a++;
        }
    }
    return meses;
}

/** Los pagos que se le deben a una persona en un ciclo, en orden de fecha. */
export function pagosDelPersonal(opciones: { acuerdo: Acuerdo; nomina: Nomina; inicio: string; cierre: string }): PagoDebido[] {
    const { acuerdo, nomina } = opciones;
    const inicio = opciones.inicio.slice(0, 10);
    const cierre = opciones.cierre.slice(0, 10);
    const vacaciones = new Set(nomina.mesesDeVacaciones);
    const cobraEnVacaciones = acuerdo.cobraEnVacaciones ?? nomina.cobraEnVacaciones;
    const pagos: PagoDebido[] = [];
    if (acuerdo.montoCents > 0) {
        if (acuerdo.frecuencia === 'UNICO') {
            if (acuerdo.fechaUnica) {
                pagos.push({ clave: 'U', etiqueta: 'Pago único', fecha: acuerdo.fechaUnica.slice(0, 10), montoCents: acuerdo.montoCents, tipo: 'UNICO', vacaciones: false });
            }
        } else {
            for (const mes of mesesEntre(inicio, cierre)) {
                const esVacaciones = vacaciones.has(mes);
                if (esVacaciones && !cobraEnVacaciones) continue;
                const a = Number(mes.slice(0, 4));
                const m = Number(mes.slice(5, 7));
                const nombre = `${MESES[m - 1]} ${a}`;
                if (acuerdo.frecuencia === 'MENSUAL') {
                    const dia = acuerdo.diaDePago ?? nomina.diaDePago;
                    pagos.push({ clave: `S:${mes}`, etiqueta: nombre, fecha: fecha(a, m, dia), montoCents: acuerdo.montoCents, tipo: 'SUELDO', vacaciones: esVacaciones });
                } else {
                    pagos.push({ clave: `S:${mes}-1`, etiqueta: `${nombre} · 1ª quincena`, fecha: fecha(a, m, 15), montoCents: acuerdo.montoCents, tipo: 'SUELDO', vacaciones: esVacaciones });
                    pagos.push({ clave: `S:${mes}-2`, etiqueta: `${nombre} · 2ª quincena`, fecha: fecha(a, m, 31), montoCents: acuerdo.montoCents, tipo: 'SUELDO', vacaciones: esVacaciones });
                }
            }
        }
    }
    const bono = acuerdo.bonoCents ?? nomina.bonoCents;
    if (bono > 0) {
        const primerMesDeVacaciones = [...vacaciones].sort()[0];
        const cuando = acuerdo.fechaBono ?? nomina.fechaBono ?? (primerMesDeVacaciones ? `${primerMesDeVacaciones}-01` : null);
        if (cuando) pagos.push({ clave: 'B', etiqueta: 'Bono vacacional', fecha: cuando.slice(0, 10), montoCents: bono, tipo: 'BONO', vacaciones: true });
    }
    return pagos.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.clave.localeCompare(y.clave));
}

/** Cada pago con lo pagado y su estado, con «hoy» del liceo. */
export function estadoDelPersonal(pagos: PagoDebido[], pagadoPorClave: Map<string, number>, hoy: string) {
    let totalCents = 0;
    let pagadoCents = 0;
    let vencidoCents = 0;
    const conEstado = pagos.map<PagoDebidoConEstado>((p) => {
        const pagado = Math.min(p.montoCents, Math.max(0, pagadoPorClave.get(p.clave) ?? 0));
        const pendiente = p.montoCents - pagado;
        totalCents += p.montoCents;
        pagadoCents += pagado;
        let estado: EstadoDePago;
        if (pendiente === 0) estado = 'PAGADO';
        else if (hoy > p.fecha) {
            estado = 'VENCIDO';
            vencidoCents += pendiente;
        } else if (pagado > 0) estado = 'ABONADO';
        else estado = 'PENDIENTE';
        return { ...p, pagadoCents: pagado, pendienteCents: pendiente, estado };
    });
    const proximo = conEstado.find((p) => p.pendienteCents > 0) ?? null;
    return { pagos: conEstado, totalCents, pagadoCents, vencidoCents, pendienteCents: totalCents - pagadoCents, proximo };
}

/** Reparte un monto entre los pagos elegidos, de lo más viejo a lo más nuevo. */
export function repartirAlPersonal(montoCents: number, elegidos: PagoDebidoConEstado[]) {
    const orden = [...elegidos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clave.localeCompare(b.clave));
    const reparto: Array<{ clave: string; montoCents: number }> = [];
    let queda = montoCents;
    for (const p of orden) {
        if (queda <= 0) break;
        const va = Math.min(queda, p.pendienteCents);
        if (va > 0) {
            reparto.push({ clave: p.clave, montoCents: va });
            queda -= va;
        }
    }
    return reparto;
}

// ─── Validar lo que manda el admin ───────────────────────────────────────────

const MONTO_MAXIMO = 1_000_000_000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const limpio = (t: unknown, max: number) => (t == null ? null : String(t).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, max) || null);
const mal = (m: string, code = 'DATOS_INVALIDOS'): never => {
    throw Object.assign(AppErrors.BadRequest(m), { code });
};

export const aCents = (v: unknown) => Math.round(Number(v) * 100);

export function validarMonto(v: unknown, que = 'el monto'): number {
    const c = aCents(v);
    if (!Number.isFinite(c) || c <= 0 || c > MONTO_MAXIMO) mal(`Indica ${que} (mayor que cero)`, 'MONTO_INVALIDO');
    return c;
}

export function validarFecha(v: unknown, que = 'la fecha'): string {
    const t = String(v ?? '');
    if (!FECHA.test(t) || Number.isNaN(Date.parse(`${t}T00:00:00Z`))) mal(`Indica ${que} (AAAA-MM-DD)`, 'FECHA_INVALIDA');
    return t;
}

export function validarAcuerdo(e: any) {
    const frecuencia = e?.frecuencia;
    if (!FRECUENCIAS_DEL_PERSONAL.includes(frecuencia)) mal('Frecuencia inválida: único, mensual o quincenal');
    const montoCents = validarMonto(e.monto, 'cuánto se le paga');
    const dia = e.diaDePago == null || e.diaDePago === '' ? null : Number(e.diaDePago);
    if (dia !== null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) mal('El día de pago va del 1 al 31 (31 = el último del mes)');
    const fechaUnica = frecuencia === 'UNICO' ? validarFecha(e.fechaUnica, 'la fecha del pago único') : null;
    const cobra = e.cobraEnVacaciones == null ? null : Boolean(e.cobraEnVacaciones);
    const bono = e.bonoVacacional == null || e.bonoVacacional === '' ? null : aCents(e.bonoVacacional);
    if (bono !== null && (!Number.isFinite(bono) || bono < 0 || bono > MONTO_MAXIMO)) mal('Bono vacacional inválido');
    const fechaBono = e.fechaBono ? validarFecha(e.fechaBono, 'la fecha del bono') : null;
    return { montoCents, frecuencia: frecuencia as Frecuencia, diaDePago: dia, fechaUnica, cobraEnVacaciones: cobra, bonoCents: bono, fechaBono };
}

export function validarNomina(e: any) {
    const dia = Number(e?.diaDePago ?? 31);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) mal('El día de pago va del 1 al 31 (31 = el último del mes)');
    const meses = Array.isArray(e?.mesesDeVacaciones) ? [...new Set(e.mesesDeVacaciones.map(String))] : [];
    if (meses.length > 12 || meses.some((m) => !MES.test(m as string))) mal('Los meses de vacaciones van como AAAA-MM');
    const bono = e?.bonoVacacional == null || e.bonoVacacional === '' ? 0 : aCents(e.bonoVacacional);
    if (!Number.isFinite(bono) || bono < 0 || bono > MONTO_MAXIMO) mal('Bono vacacional inválido');
    const fechaBono = e?.fechaBono ? validarFecha(e.fechaBono, 'la fecha del bono') : null;
    return { diaDePago: dia, mesesDeVacaciones: (meses as string[]).sort(), cobraEnVacaciones: e?.cobraEnVacaciones !== false, bonoCents: bono, fechaBono };
}

export { limpio, sumarDias };
