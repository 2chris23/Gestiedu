import { randomUUID } from 'crypto';
import { platformPrisma } from '../config/database';

/**
 * CADA TAREA, UNA SOLA DUEÑA (18-oct-2026; `docs/IDEAS-DE-ROBUSTEZ.md` §10)
 *
 * Con varios procesos (`--scale backend=N`), cada uno corría las tareas
 * programadas entero: el cuadro de honor, el recordatorio de cuotas, el
 * mantenimiento… El resultado no se duplicaba (cada fila tiene su clave
 * única), pero el trabajo sí, N veces, y recorriendo los liceos uno a uno.
 * Con cientos de liceos eso le quita CPU y conexiones a la gente.
 *
 * Ahora la tarea toma un TURNO en la base de la plataforma (un «lease», como
 * Sidekiq o Kubernetes): una fila con hasta cuándo es de quién. Solo quien
 * lo tiene la corre; si el proceso muere, el turno caduca solo y otro la toma.
 * Sin Redis: la base ya está (tabla `turnos_de_tareas`, migración de la plataforma).
 */

const yo = `${process.pid}-${randomUUID().slice(0, 8)}`;
/** ¿Es mío el turno de `nombre` durante `duraMs`? (lo toma si está libre o caducado, o si ya era mío). */
export async function tomarElTurno(nombre: string, duraMs: number): Promise<boolean> {
    const filas = await platformPrisma.$queryRawUnsafe<Array<{ quien: string }>>(
        `INSERT INTO "turnos_de_tareas" ("nombre","quien","hasta") VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval)
         ON CONFLICT ("nombre") DO UPDATE SET "quien" = EXCLUDED."quien", "hasta" = EXCLUDED."hasta"
           WHERE "turnos_de_tareas"."hasta" < now() OR "turnos_de_tareas"."quien" = EXCLUDED."quien"
         RETURNING "quien"`,
        nombre,
        yo,
        String(Math.max(1000, Math.floor(duraMs)))
    );
    return filas.length > 0 && filas[0].quien === yo;
}

/**
 * Corre `tarea` como mucho UNA vez cada `cadaMs` entre todos los procesos.
 * El turno no se suelta al acabar: dura el periodo entero, así el proceso
 * cuyo reloj salte una hora después no la repite. Si el que la corría muere,
 * el turno caduca con el periodo y la siguiente vuelta la toma otro.
 * Devuelve false si esta vuelta ya era de otro.
 */
export async function unaVezCada(nombre: string, cadaMs: number, tarea: () => Promise<void>): Promise<boolean> {
    // Un poco menos que el periodo: el reloj de cada proceso no es exacto.
    if (!(await tomarElTurno(nombre, Math.floor(cadaMs * 0.9)))) return false;
    await tarea();
    return true;
}
