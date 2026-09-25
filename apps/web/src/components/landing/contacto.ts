/**
 * DOS DATOS DE LA PORTADA QUE NO SE PUEDEN INVENTAR
 *
 * Los pone quien despliega, en la compilación (la portada es estática: se
 * pinta una vez al compilar, y ahí se leen):
 *
 * - `NEXT_PUBLIC_CONTACTO_DEMO`: adónde escribe un director que aún no es
 *   cliente. Un `https://wa.me/58…`, un `mailto:` o una página. Sin él, la
 *   portada no enseña «Pide una demostración»: un botón que no lleva a nadie
 *   es peor que no tenerlo, y el sistema no tiene registro abierto (cada liceo
 *   lo da de alta la plataforma).
 * - `NEXT_PUBLIC_SITIO_URL`: la dirección pública de la portada
 *   (`https://…`). WhatsApp y los buscadores solo aceptan la imagen para
 *   compartir con la dirección completa; sin ella, Next la escribiría con
 *   `localhost` y el enlace saldría sin foto igual. Así que sin dirección no
 *   se anuncia imagen.
 *
 * Solo se aceptan esquemas que abren algo razonable: nada de `javascript:`.
 */

function leer(nombre: string | undefined): string | undefined {
    const v = nombre?.trim();
    return v ? v : undefined;
}

export function contactoDemo(valor = process.env.NEXT_PUBLIC_CONTACTO_DEMO): string | undefined {
    const v = leer(valor);
    if (!v) return undefined;
    return /^(https:\/\/|mailto:)/i.test(v) ? v : undefined;
}

export function direccionDelSitio(valor = process.env.NEXT_PUBLIC_SITIO_URL): URL | undefined {
    const v = leer(valor);
    if (!v) return undefined;
    try {
        const url = new URL(v);
        return url.protocol === 'https:' || url.hostname === 'localhost' ? url : undefined;
    } catch {
        return undefined;
    }
}

/** Si el enlace sale de la página (WhatsApp, otra web), se abre aparte. */
export function abreFuera(enlace: string): boolean {
    return /^https:\/\//i.test(enlace);
}
