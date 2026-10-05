/**
 * LO QUE NO SE ESCRIBE EN LOS REGISTROS (datos de menores, 2026-10-05)
 *
 * Los registros los lee quien opera el servidor, se copian a otras máquinas y
 * viven semanas. En este sistema la cédula ES el id del usuario, así que cada
 * `userId`, cada ruta `/students/12345678/boleta` y cada búsqueda guardaba la
 * cédula de un niño en claro. Y alguna vez, correos.
 *
 *   · contraseñas, llaves y cookies: fuera («[oculto]»);
 *   · correos: solo el dominio (`***@liceo.edu.ve`);
 *   · cifras de 6 o más (cédulas, teléfonos): solo las 3 últimas.
 *
 * Basta para seguir una petición en el registro («la ***678 falló al guardar»)
 * sin que el registro sea una lista de cédulas. REGISTRO-01…03.
 */

const SECRETOS = /pass(word)?|contrase|token|secret|authorization|cookie|llave|apikey|api_key|databasePassword/i;
const CORREO = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const CIFRAS = /\d{6,}/g;

export function taparEnTexto(texto: string): string {
    return texto.replace(CORREO, (_t, _u, dominio) => `***@${dominio}`).replace(CIFRAS, (n) => `${'*'.repeat(n.length - 3)}${n.slice(-3)}`);
}

export function taparDatos(valor: unknown, hondura = 0): unknown {
    if (hondura > 5 || valor === null || valor === undefined) return valor;
    if (typeof valor === 'string') return taparEnTexto(valor);
    if (valor instanceof Error) return valor; // su mensaje se tapa al escribirse (ver logger)
    if (Array.isArray(valor)) return valor.map((v) => taparDatos(v, hondura + 1));
    if (typeof valor === 'object') {
        const fuera: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
            fuera[k] = SECRETOS.test(k) && v !== undefined && v !== null && v !== '' ? '[oculto]' : taparDatos(v, hondura + 1);
        }
        return fuera;
    }
    return valor;
}
