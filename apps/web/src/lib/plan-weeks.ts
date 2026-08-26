/**
 * CÁLCULO DE SEMANAS DEL PLAN DE EVALUACIÓN — ALINEADO A LUNES.
 *
 * Regla:
 *  - SEMANA 1 = desde la fecha de inicio del lapso (fechaDesde del plan) hasta
 *    el domingo previo al PRIMER LUNES DESPUÉS de la semana inicial.
 *    Ej: inicio 19/08/2026 (miércoles) → Semana 1 = 19/08 → 30/08/2026.
 *  - SEMANA N (N≥2) = semana calendario lun→dom que inicia en ese primer lunes
 *    (inicio 19/08 → Lunes 31/08 abre la Semana 2: 31/08 → 06/09).
 *
 * Los componentes de fecha se extraen con getUTC* (ver copia backend) para que
 * un Date 'YYYY-MM-DD' (medianoche UTC) y uno a mediodía local sean el mismo día.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function startOfDay(d: Date): Date {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function atNoon(d: Date): Date {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
}

function mondayOf(d: Date): Date {
    const base = atNoon(d);
    const diff = (base.getDay() + 6) % 7;
    base.setDate(base.getDate() - diff);
    return base;
}

function nextMondayAfter(d: Date): Date {
    const base = atNoon(d);
    const delta = ((8 - base.getDay()) % 7) || 7;
    base.setDate(base.getDate() + delta);
    return base;
}

function weekTwoMonday(lapsoStart: Date): Date {
    return nextMondayAfter(new Date(atNoon(lapsoStart).getTime() + 6 * DAY_MS));
}

export function planWeekNumberFromRange(lapsoStart: Date, date: Date): number {
    const start = atNoon(lapsoStart);
    const d = startOfDay(date);
    const monday2 = weekTwoMonday(lapsoStart);
    if (d.getTime() < startOfDay(monday2).getTime()) return 1;
    const weeks = Math.floor((mondayOf(d).getTime() - monday2.getTime()) / WEEK_MS) + 2;
    return Math.max(2, weeks);
}

export function planWeekRangeFromRange(lapsoStart: Date, weekNumber: number): { start: Date; end: Date } {
    const start = atNoon(lapsoStart);
    const monday2 = weekTwoMonday(lapsoStart);
    if (weekNumber <= 1) {
        return { start, end: new Date(monday2.getTime() - DAY_MS) };
    }
    const weekStart = new Date(monday2.getTime() + (weekNumber - 2) * WEEK_MS);
    return { start: weekStart, end: new Date(weekStart.getTime() + 6 * DAY_MS) };
}
