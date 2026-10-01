/**
 * QUÉ LICEO DICE LA DIRECCIÓN
 *
 * `sanmiguel.gestiedu.com` → `sanmiguel`. Parece una línea y tiene tres
 * trampas, y las tres han mordido:
 *
 *  1. **Una dirección de red NO tiene subdominio.** `192.168.1.156` partido por
 *     puntos da cuatro trozos, así que el código de antes se quedaba con el
 *     primero y buscaba el liceo «192». Abriendo la app en un teléfono, por la
 *     dirección del ordenador en el wifi, la pantalla decía «el instituto 192
 *     no está registrado». Lo mismo pasaría en cualquier servidor al que se
 *     entre por su número.
 *  2. Los túneles públicos (`algo.trycloudflare.com`) tampoco: ese primer trozo
 *     es basura que cambia cada vez.
 *  3. `www`, `superadmin` y `super-admin` no son liceos.
 *
 * Esto estaba copiado en tres sitios —el guardián de pantallas, la pantalla de
 * entrar y el gancho del instituto— y solo uno de los tres tenía la primera
 * trampa cubierta. Por eso ahora hay una sola copia.
 */

const TUNELES = [
    'lhr.life',
    'localhost.run',
    'localtunnel.me',
    'ngrok-free.app',
    'trycloudflare.com',
    'pinggy.link',
    'pinggy.io',
];

const NO_SON_LICEOS = new Set(['www', 'superadmin', 'super-admin']);

/** `192.168.1.156`, `10.0.5.254`… */
const ES_UNA_DIRECCION_DE_RED = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * @param host el nombre del servidor, con o sin puerto.
 * @returns el nombre corto del liceo, o `null` si esa dirección no nombra a ninguno.
 */
export function elLiceoDelHost(host: string | null | undefined): string | null {
    if (!host) return null;

    const nombre = host.split(':')[0].toLowerCase();

    if (nombre === 'localhost' || ES_UNA_DIRECCION_DE_RED.test(nombre)) return null;

    for (const tunel of TUNELES) {
        if (nombre === tunel || nombre.endsWith('.' + tunel)) return null;
    }

    // sanmiguel.localhost (desarrollo)
    if (nombre.endsWith('.localhost')) {
        const sub = nombre.slice(0, -'.localhost'.length);
        return sub && !NO_SON_LICEOS.has(sub) ? sub : null;
    }

    // sanmiguel.gestiedu.com
    const partes = nombre.split('.');
    if (partes.length >= 3 && !NO_SON_LICEOS.has(partes[0])) return partes[0];

    return null;
}

export default elLiceoDelHost;
