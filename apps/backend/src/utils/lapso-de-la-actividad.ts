/**
 * ¿DE QUÉ LAPSO ES UNA NOTA DE CLASE EN VIVO?
 *
 * Una actividad de Clase en Vivo que cuelga de un criterio del plan es del
 * lapso de ese criterio. Una «suelta» (sin criterio) no decía de qué lapso era,
 * y el cálculo sin plan la sumaba a TODOS: un 20 del primer lapso aparecía
 * también en el segundo y en el tercero (LAP-01…03).
 *
 * Ahora la suelta es del lapso de su fecha: la de la clase en que se puso; si
 * no tiene clase, la de entrega; si tampoco, el día en que se creó. Una fecha
 * entre dos lapsos (vacaciones) va al que acaba de terminar; una anterior al
 * primero, al primero.
 *
 * Pura, sin base: la usan el cálculo de un alumno (`grades.service`) y el de
 * bloque (`bulk-averages.service`), que tienen que dar lo mismo.
 */

export interface LapsoConFechas {
    id: string;
    startDate: Date;
    endDate: Date;
}

export interface FechasDeLaActividad {
    fechaDeLaClase?: Date | string | null;
    dueDate?: Date | string | null;
    createdAt?: Date | string | null;
}

const ymd = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** La fecha que decide el lapso de una actividad suelta. */
export function fechaDeLaActividad(a: FechasDeLaActividad): string | null {
    const f = a.fechaDeLaClase ?? a.dueDate ?? a.createdAt;
    return f ? ymd(f) : null;
}

/** El lapso (id) al que pertenece una fecha "YYYY-MM-DD", o null si no hay lapsos. */
export function lapsoDeLaFecha(fecha: string | null, lapsos: LapsoConFechas[]): string | null {
    if (lapsos.length === 0) return null;
    const ordenados = [...lapsos].sort((a, b) => ymd(a.startDate).localeCompare(ymd(b.startDate)));
    if (!fecha) return null;
    const dentro = ordenados.find((p) => ymd(p.startDate) <= fecha && fecha <= ymd(p.endDate));
    if (dentro) return dentro.id;
    const yaEmpezados = ordenados.filter((p) => ymd(p.startDate) <= fecha);
    return (yaEmpezados[yaEmpezados.length - 1] ?? ordenados[0]).id;
}
