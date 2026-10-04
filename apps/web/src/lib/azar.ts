/**
 * UN POCO DE AZAR EN CADA ESPERA (2026-10-04)
 *
 * Cuando vuelve la luz, vuelven a la vez cientos de teléfonos: reconectan el
 * tiempo real, preguntan al servidor si contesta, suben lo pendiente y se
 * bajan lo de su rol. Si todos esperan lo MISMO (5 s, 10 s, 20 s…), todos
 * llaman en el mismo segundo, el servidor se ahoga, todos fallan y todos
 * vuelven a llamar juntos otra vez (la «estampida»). Con un poco de azar cada
 * uno llega en su momento.
 *
 * `azar` se puede pasar para las pruebas (por defecto, `Math.random`).
 */

/** `ms` ± `margen` (0.3 = de 0,7·ms a 1,3·ms). */
export function conAzar(ms: number, margen = 0.3, azar: () => number = Math.random): number {
    return Math.round(ms * (1 - margen + azar() * margen * 2));
}

/** Entre 0 y `hasta` ms: para no salir todos a la vez al volver la conexión. */
export function escalonar(hasta: number, azar: () => number = Math.random): number {
    return Math.round(azar() * hasta);
}

/**
 * Lo que pide el servidor con `Retry-After` (segundos o una fecha), en ms.
 * Sin cabecera o ilegible, `null`.
 */
export function esperaQuePide(cabecera: string | null | undefined, ahora = Date.now()): number | null {
    if (!cabecera) return null;
    const segundos = Number(cabecera);
    if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos, 3600) * 1000;
    const fecha = Date.parse(cabecera);
    return Number.isFinite(fecha) ? Math.max(0, Math.min(fecha - ahora, 3600_000)) : null;
}
