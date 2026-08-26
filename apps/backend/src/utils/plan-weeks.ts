/**
 * CÁLCULO DE SEMANAS DEL PLAN DE EVALUACIÓN — ALINEADO A LUNES.
 *
 * Regla (corregida por el usuario):
 *  - SEMANA 1 = desde la fecha de inicio del lapso (fechaDesde del plan) hasta
 *    el domingo previo al PRIMER LUNES DESPUÉS de la semana inicial.
 *    Ej: inicio 19/08/2026 (miércoles) → Semana 1 = 19/08 → 30/08/2026.
 *  - SEMANA N (N≥2) = semana calendario lun→dom que inicia en ese primer lunes.
 *    Ej inicio 19/08 → Lunes 31/08/2026 abre la Semana 2 (31/08 → 06/09).
 *
 * BUG CORREGIDO: antes se hacía Math.floor(diff/7d)+1 con semanas corridas
 * desde la fecha de inicio (mié→mar 19-25, 26-01...), lo que hacía que la
 * "Semana 2" apareciera el 26/08 en vez del lunes 31/08.
 *
 * TZ: los componentes de fecha se extraen con getUTC* para que tanto un Date
 * guardado como 'YYYY-MM-DD' (medianoche UTC) como uno a mediodía local
 * representen el MISMO día (en zonas UTC-x uno y otro quedaban corridos).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function startOfDay(d: Date): Date {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function atNoon(d: Date): Date {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
}

/** Lunes de la semana lun→dom que contiene la fecha. */
function mondayOf(d: Date): Date {
    const base = atNoon(d);
    const diff = (base.getDay() + 6) % 7;
    base.setDate(base.getDate() - diff);
    return base;
}

/** Próximo lunes estrictamente posterior a la fecha dada. */
function nextMondayAfter(d: Date): Date {
    const base = atNoon(d);
    const delta = ((8 - base.getDay()) % 7) || 7;
    base.setDate(base.getDate() + delta);
    return base;
}

/** Primer lunes que abre la Semana 2: el siguiente a la semana inicial (inicio+6d). */
function weekTwoMonday(lapsoStart: Date): Date {
    return nextMondayAfter(new Date(atNoon(lapsoStart).getTime() + 6 * DAY_MS));
}

/** Número de semana del plan para una fecha dada (Lunes alineado). */
export function planWeekNumberFromRange(lapsoStart: Date, date: Date): number {
    const start = atNoon(lapsoStart);
    const d = startOfDay(date);
    const monday2 = weekTwoMonday(lapsoStart);
    // Todo lo que esté entre el inicio y el primer lunes (inclusive su semana)
    // pertenece a la SEMANA 1 (la primera semana abarca hasta el domingo previo).
    if (d.getTime() < startOfDay(monday2).getTime()) return 1;
    const weeks = Math.floor((mondayOf(d).getTime() - monday2.getTime()) / WEEK_MS) + 2;
    return Math.max(2, weeks);
}

/** Rango [inicio, fin] de la semana N del plan (fin = domingo 23:59 local). */
export function planWeekRangeFromRange(lapsoStart: Date, weekNumber: number): { start: Date; end: Date } {
    const start = atNoon(lapsoStart);
    const monday2 = weekTwoMonday(lapsoStart);
    if (weekNumber <= 1) {
        const end = new Date(monday2.getTime() - DAY_MS);
        return { start, end };
    }
    const weekStart = new Date(monday2.getTime() + (weekNumber - 2) * WEEK_MS);
    return { start: weekStart, end: new Date(weekStart.getTime() + 6 * DAY_MS) };
}
