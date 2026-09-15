/**
 * LA HORA LA PONE EL SERVIDOR
 *
 * El reloj del teléfono o del computador de quien usa el sistema no vale: se
 * puede cambiar a mano, y una VPN puede mover la zona horaria. Si el sistema se
 * fiara de él, un estudiante podría poner las 12 cuando son las 10 y ver (o
 * intentar registrar) la clase que no toca.
 *
 * Todo lo que dependa de "ahora" o de "hoy" se calcula aquí, con el reloj del
 * servidor y la zona horaria del liceo (por defecto America/Caracas).
 */

export const ZONA_POR_DEFECTO = 'America/Caracas';

/** "YYYY-MM-DD" del día que es AHORA en la zona del liceo. */
export function todayInTimezone(timezone: string = ZONA_POR_DEFECTO, now: Date = new Date()): string {
    try {
        // 'en-CA' da directamente el formato YYYY-MM-DD
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(now);
    } catch {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: ZONA_POR_DEFECTO,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(now);
    }
}

/** "HH:mm" de la hora que es AHORA en la zona del liceo. */
export function timeInTimezone(timezone: string = ZONA_POR_DEFECTO, now: Date = new Date()): string {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(now);
    } catch {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: ZONA_POR_DEFECTO,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(now);
    }
}

/** ¿Esa fecha ("YYYY-MM-DD" o Date) es posterior a hoy en el liceo? */
export function isFutureDate(fecha: string | Date, timezone: string = ZONA_POR_DEFECTO, now: Date = new Date()): boolean {
    const ymd =
        typeof fecha === 'string'
            ? fecha.slice(0, 10)
            : new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'UTC',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
              }).format(fecha);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
    return ymd > todayInTimezone(timezone, now);
}

/** Zona horaria configurada del liceo; si no hay, la de Venezuela. */
export async function instituteTimezone(prisma: any): Promise<string> {
    try {
        const inst = await prisma.institute.findFirst({ select: { timezone: true } });
        return inst?.timezone || ZONA_POR_DEFECTO;
    } catch {
        return ZONA_POR_DEFECTO;
    }
}
