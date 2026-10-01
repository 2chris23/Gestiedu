/**
 * ¿DE QUÉ DÍA ES UNA ACTIVIDAD, Y DÓNDE SALE?
 *
 * Una actividad de la clase en vivo es del día de su clase (su sesión). Las
 * que se crearon sin sesión —así nacían todas las de un día en que aún no se
 * había guardado asistencia— se fechaban por su `createdAt` leído en UTC: vista
 * la clase del 21 el día 27, la actividad era «del 27» y no salía en ninguna
 * lista; y desde las 20:00 de Caracas, ni siquiera el mismo día. El profesor
 * veía «Actividad añadida» y nada más (ACTDIA-*).
 *
 * Ahora toda actividad nueva lleva la sesión del día que se ve; las viejas sin
 * sesión se fechan por su `createdAt` en la zona del LICEO.
 *
 * Días como «YYYY-MM-DD», que se comparan sin sorpresas de zona.
 */
import { todayInTimezone } from './school-time';

/** El día de una fecha guardada a medianoche o mediodía (sesión, entrega). */
export const diaGuardado = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);

interface ActividadConDia {
    target: string;
    classSessionId?: string | null;
    classSession?: { date: Date | string } | null;
    dueDate?: Date | string | null;
    createdAt: Date | string;
}

/** El día en que nació la actividad: el de su clase, o el de su creación en el liceo. */
export function diaDeLaActividad(a: ActividadConDia, zona: string): string {
    if (a.classSession?.date) return diaGuardado(a.classSession.date);
    return todayInTimezone(zona, new Date(a.createdAt));
}

/**
 * Dónde sale en la clase de `dia` (con su sesión, si existe):
 * - `hoy`: nació en esta clase para esta clase, o vence este día.
 * - `proxima`: nació en esta clase para otro día (REGLA DEL PRODUCTO: una
 *   actividad para la próxima clase solo se anuncia en la clase donde se creó;
 *   el día que vence sale como «hoy» esté donde esté el profesor).
 */
export function clasificar(a: ActividadConDia, dia: string, sesionId: string | null | undefined, zona: string) {
    const enSuSesion = Boolean(a.classSessionId && sesionId && a.classSessionId === sesionId);
    const nacioAqui = enSuSesion || diaDeLaActividad(a, zona) === dia;
    const venceAqui = Boolean(a.dueDate && diaGuardado(a.dueDate) === dia);
    const hoy = venceAqui || (a.target === 'CURRENT' && nacioAqui);
    const proxima = a.target === 'NEXT' && nacioAqui && !hoy;
    return { nacioAqui, hoy, proxima, dondeSale: hoy ? ('HOY' as const) : proxima ? ('PROXIMA' as const) : null };
}
