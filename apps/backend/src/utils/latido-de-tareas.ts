import { RedisCache } from '../config/redis';

/**
 * EL LATIDO DE LAS TAREAS (FALLA GRIS, 2026-10-04)
 *
 * Una tarea que deja de correr no da ningún error: simplemente no pasa nada.
 * Así se quedó una vez el recordatorio de cuotas sin enviarse (no arrancaba
 * sin Redis) y nadie lo vio. Cada tarea apunta aquí cuándo corrió y si le
 * fue bien; el panel del superadmin (`/api/monitoring/health`) dice cuál está
 * **atrasada** (no ha ido bien en dos vueltas) o **fallando**.
 *
 * Va a la memoria rápida con la llave `platform:` (no es de ningún liceo) para
 * que con varios procesos se vea la última vez de cualquiera; sin Redis, la del
 * proceso. Apuntar no falla nunca: un latido no puede tumbar la tarea.
 */

export interface Latido {
    ultimaVez: string;
    ultimaVezBien: string | null;
    error: string | null;
    /** Cada cuánto debería correr (ms). */
    cadaMs: number;
}

export type SaludDeLaTarea = 'bien' | 'atrasada' | 'fallando';

const LLAVE = (nombre: string) => `platform:latido:${nombre}`;
const enMemoria = new Map<string, Latido>();
const conocidas = new Set<string>();

export async function latido(nombre: string, cadaMs: number, error?: unknown): Promise<void> {
    conocidas.add(nombre);
    const ahora = new Date().toISOString();
    const antes = enMemoria.get(nombre) ?? ((await RedisCache.get<Latido>(LLAVE(nombre)).catch(() => null)) as Latido | null);
    const nuevo: Latido = {
        ultimaVez: ahora,
        ultimaVezBien: error ? (antes?.ultimaVezBien ?? null) : ahora,
        error: error ? (error instanceof Error ? error.message : String(error)).slice(0, 300) : null,
        cadaMs,
    };
    enMemoria.set(nombre, nuevo);
    // 30 días: si una tarea desaparece del código, su latido se va solo.
    await RedisCache.set(LLAVE(nombre), nuevo, 30 * 24 * 3600).catch(() => undefined);
}

export function saludDe(l: Latido | null, ahora = Date.now()): SaludDeLaTarea {
    if (!l) return 'atrasada';
    const bien = l.ultimaVezBien ? new Date(l.ultimaVezBien).getTime() : 0;
    // Dos vueltas (y diez minutos de gracia) sin ir bien: algo pasa.
    if (ahora - bien > l.cadaMs * 2 + 10 * 60_000) return l.error ? 'fallando' : 'atrasada';
    return l.error ? 'fallando' : 'bien';
}

/** Las que han latido en este proceso o en otro (las que se conocen aquí). */
export async function losLatidos(nombres: string[] = Array.from(conocidas)): Promise<Record<string, Latido & { salud: SaludDeLaTarea }>> {
    const r: Record<string, Latido & { salud: SaludDeLaTarea }> = {};
    for (const n of new Set([...nombres, ...conocidas])) {
        const l = ((await RedisCache.get<Latido>(LLAVE(n)).catch(() => null)) as Latido | null) ?? enMemoria.get(n) ?? null;
        if (l) r[n] = { ...l, salud: saludDe(l) };
    }
    return r;
}

/** Para las pruebas. */
export function olvidarLosLatidos(): void {
    enMemoria.clear();
    conocidas.clear();
}
