/**
 * EL CICLO COMO CALENDARIO (2026-10-01)
 *
 * Cristian pidió ver los pagos «más como un calendario»: arriba los 12 meses
 * del ciclo y, al tocar uno, ese mes en días. Aquí están las cuentas puras
 * (sin pantalla) que usan Finanzas, la ficha del alumno y «Mis pagos»: qué
 * meses tiene un ciclo, cómo se reparte un mes en semanas (lunes primero, como
 * en Venezuela) y en qué mes cae cada cosa.
 *
 * Las fechas van como texto `AAAA-MM-DD`, en la zona del liceo: nunca se pasa
 * por `new Date()` local, que en Caracas a las 20:00 ya es el día siguiente en UTC.
 */

export const NOMBRES_DE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const DIAS_DE_LA_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const dos = (n: number) => String(n).padStart(2, '0');

/** «2026-10» → «Octubre 2026». */
export function nombreDelMes(mes: string): string {
    const [a, m] = mes.split('-').map(Number);
    return `${NOMBRES_DE_MES[m - 1]} ${a}`;
}

/** «2026-10» → «Oct». */
export const mesCorto = (mes: string) => MES_CORTO[Number(mes.slice(5, 7)) - 1];

/** Los meses que toca un ciclo, del de inicio al de cierre (ambos incluidos). */
export function mesesDelCiclo(inicio: string, cierre: string): string[] {
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

const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/**
 * El mes como rejilla de semanas, lunes primero: `null` en los huecos de antes
 * del día 1 y de después del último, para que cada fila tenga siete.
 */
export function rejillaDelMes(mes: string): Array<string | null> {
    const a = Number(mes.slice(0, 4));
    const m = Number(mes.slice(5, 7));
    // getUTCDay: 0 = domingo. Lunes primero: domingo va al final (6).
    const primero = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
    const celdas: Array<string | null> = Array(primero).fill(null);
    for (let d = 1; d <= diasDelMes(a, m); d++) celdas.push(`${mes}-${dos(d)}`);
    while (celdas.length % 7 !== 0) celdas.push(null);
    return celdas;
}

/** El mes de una fecha `AAAA-MM-DD`. */
export const mesDe = (fecha: string) => fecha.slice(0, 7);

/** Lo cobrado frente a lo esperado, en un porcentaje entero (0–100), sin dividir por cero. */
export function porcentaje(parte: number, total: number): number {
    if (!(total > 0)) return 0;
    return Math.max(0, Math.min(100, Math.round((parte / total) * 100)));
}

export type EstadoDelMes = 'pasado' | 'actual' | 'futuro';

/** Si un mes ya pasó, es el de hoy o está por venir (con «hoy» del liceo). */
export function estadoDelMes(mes: string, hoy: string): EstadoDelMes {
    const actual = mesDe(hoy);
    return mes < actual ? 'pasado' : mes === actual ? 'actual' : 'futuro';
}

/** Agrupa cualquier cosa con fecha por mes: `{ '2026-10': [...] }`. */
export function porMes<T>(cosas: T[], fechaDe: (c: T) => string): Map<string, T[]> {
    const mapa = new Map<string, T[]>();
    for (const c of cosas) {
        const m = mesDe(fechaDe(c));
        if (!mapa.has(m)) mapa.set(m, []);
        mapa.get(m)!.push(c);
    }
    return mapa;
}
