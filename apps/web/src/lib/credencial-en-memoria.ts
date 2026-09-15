/**
 * LA CREDENCIAL DE LA SESIÓN NO SE DEJA POR ESCRITO
 *
 * Al entrar, el servidor devuelve dos llaves:
 *
 *   - la **larga** (`refresh_token`), que sirve para pedir llaves nuevas durante
 *     días. Esa la guarda el navegador marcada `httpOnly`: ningún programa de la
 *     página puede leerla, ni siquiera uno metido a la fuerza.
 *   - la **corta** (`access_token`), que dura 15 minutos y es la que se enseña
 *     en cada petición.
 *
 * La corta se guardaba en una cookie **legible desde la página**, y el propio
 * código lo decía:
 *
 *     httpOnly: false, // Not HttpOnly so axios interceptor can read it
 *
 * O sea: se dejó abierta a propósito, porque hacía falta para poder leerla desde
 * el navegador. El problema es que cualquier cosa que consiga ejecutar código en
 * la página la lee igual de fácil —una línea, `document.cookie`— y se la lleva.
 * Y una vez fuera, sirve durante quince minutos desde cualquier sitio del mundo.
 *
 * ─── LO QUE SE HACE AHORA ────────────────────────────────────────────────────
 *
 * La llave corta vive **solo en la memoria de la pestaña**, en esta variable. No
 * está en `document.cookie`, ni en `localStorage`, ni en `sessionStorage`. No
 * hay ningún sitio del que copiarla.
 *
 * La cookie `access_token` sigue existiendo, pero ahora marcada `httpOnly`: la
 * usa **el guardián de pantallas** (`proxy.ts`), que corre en el servidor y sí
 * puede leerla. Desde la página ya no se ve.
 *
 * ─── QUÉ PASA AL RECARGAR ────────────────────────────────────────────────────
 *
 * Al recargar, la memoria se vacía: es justo lo que se busca. Entonces se pide
 * una llave nueva con la larga, que sigue en su cookie. Eso es una petición
 * más al abrir, y a cambio no queda ninguna credencial por escrito.
 *
 * ─── LO QUE ESTO NO ARREGLA, DICHO CLARO ─────────────────────────────────────
 *
 * Si alguien consigue ejecutar código dentro de la página, **puede seguir
 * haciendo peticiones como tú mientras la pestaña esté abierta**: está dentro.
 * Lo que ya no puede es llevarse la llave y usarla luego desde su casa, que es
 * la diferencia entre un rato y quince minutos en cualquier parte.
 */

let credencial: string | null = null;

/** Se llama al entrar y cada vez que se renueva la llave. */
export function guardarCredencial(token: string | null | undefined): void {
    credencial = token || null;
}

/** La llave de esta pestaña, o nada si todavía no hay. */
export function laCredencial(): string | null {
    return credencial;
}

/** Al cerrar sesión. */
export function olvidarCredencial(): void {
    credencial = null;
}

/**
 * PEDIR UNA LLAVE NUEVA, UNA SOLA VEZ AUNQUE LO PIDAN VEINTE PANTALLAS
 *
 * Al recargar, todas las pantallas piden sus datos a la vez y todas se
 * encuentran sin llave. Sin esto saldrían veinte peticiones de renovación a la
 * vez; con esto sale una y las demás esperan a esa.
 */
let renovacionEnCurso: Promise<string | null> | null = null;

export async function conseguirCredencial(): Promise<string | null> {
    if (credencial) return credencial;
    if (typeof window === 'undefined') return null;

    if (!renovacionEnCurso) {
        renovacionEnCurso = (async () => {
            try {
                const res = await fetch('/api/auth/refresh', { method: 'POST' });
                if (!res.ok) return null;
                const datos = await res.json().catch(() => ({}));
                guardarCredencial(datos?.accessToken);
                return credencial;
            } catch {
                return null;
            } finally {
                // Se suelta al final para que la siguiente tanda pueda volver a
                // intentarlo; si se soltara antes, dos recargas seguidas
                // compartirían un resultado viejo.
                renovacionEnCurso = null;
            }
        })();
    }

    return renovacionEnCurso;
}
