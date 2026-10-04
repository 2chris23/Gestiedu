import { logger } from './logger';

/**
 * NADA FALLA CALLADO (falla gris, 2026-10-04)
 *
 * Había más de cincuenta `.catch(() => undefined)`: avisos, contadores del
 * plan, limpiar la memoria rápida… Cosas que no deben tumbar la petición, y
 * está bien que no la tumben; pero si fallan SIEMPRE, nadie se entera. Así se
 * quedó una vez el recordatorio de cuotas sin enviarse.
 *
 * `avisarSiFalla('qué era')` deja la petición seguir igual y apunta el fallo
 * en el registro. Lo mismo repetido (Redis caído: cada petición fallaría al
 * limpiar) se apunta una vez por minuto, no mil.
 */
const ultimaVez = new Map<string, number>();
const CADA = 60_000;

export function avisarSiFalla(que: string): (error: unknown) => void {
    return (error: unknown) => {
        const mensaje = error instanceof Error ? error.message : String(error);
        const llave = `${que}|${mensaje.slice(0, 80)}`;
        const ahora = Date.now();
        if (ahora - (ultimaVez.get(llave) ?? 0) < CADA) return;
        ultimaVez.set(llave, ahora);
        if (ultimaVez.size > 500) ultimaVez.clear();
        logger.warn(`Falló sin parar la petición: ${que}`, { error: mensaje });
    };
}
