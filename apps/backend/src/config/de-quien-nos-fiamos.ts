/**
 * DE QUIÉN NOS FIAMOS CUANDO DICE DESDE DÓNDE LLAMA
 *
 * El servidor estaba con `trustProxy: true`, que significa: **fíate de quien
 * sea que diga desde qué dirección llama**.
 *
 * Esa dirección no es un dato decorativo. Con ella se cuenta:
 *
 *   - cuántas veces se ha intentado entrar desde un sitio (el contador que
 *     frena a quien prueba contraseñas);
 *   - cuántas peticiones lleva hechas quien todavía no se ha identificado.
 *
 * Y la dirección viaja en una cabecera (`X-Forwarded-For`) que **la escribe
 * quien llama**. Con `true`, cualquiera pone la que quiera: cambia el número en
 * cada intento y estrena cupo cada vez. Los límites por dirección dejan de
 * existir.
 *
 * No es teoría: se comprobó. Quince contraseñas contra la misma cuenta, cada
 * una diciendo venir de una dirección distinta, y **las quince pasaron el
 * contador por dirección** (BRUTO-01). Esa misma prueba, sin cambiar la
 * dirección, se frena a la undécima.
 *
 * ─── POR QUÉ NO SE PUEDE APAGAR SIN MÁS ──────────────────────────────────────
 *
 * Porque en producción hace falta. Delante del sistema va un repartidor
 * (nginx), y todas las peticiones le llegan al servidor **desde nginx**. Sin
 * esa cabecera, las doscientas personas de un liceo parecerían la misma
 * dirección, y volveríamos al fallo que ya se corrigió dos veces aquí: *un
 * liceo sale a internet por una sola conexión*.
 *
 * ─── LO QUE SE HACE ──────────────────────────────────────────────────────────
 *
 * Fiarse **solo del repartidor**, no de cualquiera. Se lista de quién se acepta
 * esa cabecera: las direcciones internas (que es donde vive nginx, y donde
 * ningún cliente de internet puede estar) y la propia máquina.
 *
 * Quien llegue de fuera y traiga la cabecera puesta a mano se la ignora: cuenta
 * su dirección de verdad.
 *
 * Se puede cambiar con `TRUSTED_PROXIES` si el repartidor vive en otro sitio.
 * `TRUSTED_PROXIES=false` apaga la confianza del todo (correcto si el servidor
 * está expuesto directo, sin nadie delante).
 */

/**
 * Lo de dentro: la propia máquina y los rangos privados, que es donde puede
 * estar un repartidor y donde no puede estar internet.
 */
const LO_DE_DENTRO = [
    '127.0.0.1',
    '::1',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    'fc00::/7',
];

export type ConfianzaEnElProxy = boolean | string[];

/**
 * De quién se acepta la cabecera que dice desde dónde llama la petición.
 *
 * - sin configurar → solo de lo de dentro (el caso normal: nginx delante);
 * - `TRUSTED_PROXIES=false` → de nadie;
 * - `TRUSTED_PROXIES=true` → de cualquiera. **No usar con el servidor expuesto**:
 *   deja los límites por dirección en nada. Se admite solo porque algún
 *   hospedaje mete varios repartidores en cadena y hace falta la escotilla;
 * - una lista separada por comas → de esos.
 */
export function deQuienNosFiamos(): ConfianzaEnElProxy {
    const configurado = process.env.TRUSTED_PROXIES?.trim();

    if (!configurado) return [...LO_DE_DENTRO];
    if (configurado.toLowerCase() === 'false') return false;
    if (configurado.toLowerCase() === 'true') return true;

    const lista = configurado
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

    return lista.length > 0 ? lista : [...LO_DE_DENTRO];
}

/** Para el aviso de arranque y para las pruebas. */
export function comoSeExplicaLaConfianza(confianza: ConfianzaEnElProxy): string {
    if (confianza === true) {
        return 'AVISO: se acepta la dirección que diga CUALQUIERA (TRUSTED_PROXIES=true). ' +
            'Los límites por dirección dejan de servir si el servidor está expuesto sin nada delante.';
    }
    if (confianza === false) {
        return 'No se acepta de nadie la cabecera de dirección: se usa siempre la conexión real.';
    }
    return `Se acepta la cabecera de dirección solo desde: ${confianza.join(', ')}.`;
}
