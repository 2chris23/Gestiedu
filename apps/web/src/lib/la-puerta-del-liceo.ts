/**
 * A DÓNDE SE MANDA A QUIEN SE QUEDA SIN SESIÓN
 *
 * `/login` a secas responde **«esta dirección no existe»**: la pantalla de
 * entrar necesita saber de qué liceo es. Mandar ahí a alguien es dejarlo en un
 * 404 con un botón a la portada de la plataforma y sin forma de volver a
 * entrar en su liceo.
 *
 * Esto se arregló una vez en el botón de «Cerrar sesión» y quedó sin arreglar
 * en el otro sitio donde pasa, que además es el más frecuente: cuando la sesión
 * caduca sola, `lib/axios.ts` mandaba a `/login` pelado. Cualquiera que dejara
 * la pestaña abierta un rato acababa en «página no encontrada».
 *
 * ─── Y POR QUÉ NO BASTA CON LEER LA COOKIE ──────────────────────────────────
 *
 * Porque justo cuando hace falta, la cookie ya no está: cerrar sesión la borra,
 * y lo que viene después —una petición que llega tarde y responde 401— se
 * encuentra sin liceo y manda al 404. Así que el liceo se APUNTA aparte la
 * primera vez que se ve, y de ahí se saca cuando la cookie ya no existe.
 *
 * Apuntarlo no es guardar una credencial: el nombre corto del liceo va en la
 * dirección de su propio portal, lo ve cualquiera que mire la barra del
 * navegador, y no sirve para entrar.
 */

const APUNTADO = 'ultimo_liceo';

function apuntar(liceo: string) {
    try {
        window.localStorage.setItem(APUNTADO, liceo);
    } catch {
        // Ventana privada o almacenamiento bloqueado: se sigue sin apuntar.
    }
}

function loApuntado(): string | null {
    try {
        return window.localStorage.getItem(APUNTADO) || null;
    } catch {
        return null;
    }
}

/** El liceo que dice la cookie. No es una credencial: solo dice a cuál se entra. */
export function elLiceoDeLaCookie(galletas?: string): string | null {
    const crudo = galletas ?? (typeof document !== 'undefined' ? document.cookie : '');

    const trozo = crudo
        ? crudo
              .split('; ')
              .find((c) => c.startsWith('institute_slug='))
              ?.split('=')[1]
        : undefined;

    if (trozo) {
        let limpio: string;
        try {
            limpio = decodeURIComponent(trozo).trim();
        } catch {
            limpio = trozo.trim();
        }
        if (limpio) {
            if (typeof window !== 'undefined') apuntar(limpio);
            return limpio;
        }
    }

    // La cookie ya no está —se acaba de cerrar sesión, o caducó—: vale el
    // último que se vio.
    if (typeof window !== 'undefined') return loApuntado();
    return null;
}

/**
 * La puerta de entrada del liceo de esta sesión. Si no se sabe cuál es —nunca
 * se llegó a entrar en ninguno—, `/login` a secas, que es lo único que queda.
 */
export function laPuertaDelLiceo(galletas?: string): string {
    const liceo = elLiceoDeLaCookie(galletas);
    return liceo ? `/login?slug=${encodeURIComponent(liceo)}` : '/login';
}

export default laPuertaDelLiceo;
