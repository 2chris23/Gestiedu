/**
 * LO QUE SE VIO, CAMPO A CAMPO (la configuración hecha sin conexión)
 *
 * El admin cambia la configuración sin señal y sube horas después
 * (`lib/por-enviar.ts` en la web). La pantalla manda el formulario ENTERO, así
 * que a ciegas pisaría lo que otro guardó mientras tanto en un campo que él ni
 * tocó. Por eso cada cambio pendiente trae `__visto`: por campo, lo que había
 * cuando lo cambió (`antes`) y lo que puso (`nuevo`).
 *
 *   - Campo que no tocó (antes = nuevo): se quita del cuerpo; se queda lo de ahora.
 *   - Campo que tocó y nadie más: se aplica.
 *   - Campo que tocó y otro también (ahora ≠ antes y ≠ nuevo): se pregunta
 *     (409 `CAMBIO_MIENTRAS_TANTO`, `que: 'CAMPOS'`), salvo que ya decidiera
 *     que queda lo suyo (`__decision: 'lo-mio'`).
 *
 * Sin `__visto` (lo guardado con conexión) no cambia nada.
 */

export interface Visto {
    campo: string;
    antes: unknown;
    nuevo: unknown;
}

export interface ChoqueDeCampo {
    campo: string;
    antes: unknown;
    ahora: unknown;
    tuyo: unknown;
}

const PROHIBIDOS = new Set(['__proto__', 'prototype', 'constructor']);
const RUTA = /^[A-Za-z0-9_]{1,60}(\.[A-Za-z0-9_]{1,60}){0,4}$/;

/** Un nombre de campo que se pueda recorrer sin salirse del objeto. */
function rutaValida(campo: unknown): campo is string {
    return typeof campo === 'string' && RUTA.test(campo) && !campo.split('.').some((p) => PROHIBIDOS.has(p));
}

const vacio = (v: unknown) => v === undefined || v === null || v === '';

function estable(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(estable).join(',')}]`;
    if (v && typeof v === 'object') {
        return `{${Object.keys(v as object)
            .sort()
            .filter((k) => !vacio((v as any)[k]))
            .map((k) => `${JSON.stringify(k)}:${estable((v as any)[k])}`)
            .join(',')}}`;
    }
    return JSON.stringify(v);
}

/** Vacío, nulo y ausente son lo mismo; los objetos se comparan sin mirar el orden. */
export function igual(a: unknown, b: unknown): boolean {
    if (vacio(a) && vacio(b)) return true;
    return estable(a) === estable(b);
}

export function leerCampo(obj: unknown, ruta: string): unknown {
    let o: any = obj;
    for (const parte of ruta.split('.')) {
        if (!o || typeof o !== 'object' || !Object.prototype.hasOwnProperty.call(o, parte)) return undefined;
        o = o[parte];
    }
    return o;
}

function quitarCampo(obj: any, ruta: string): void {
    const partes = ruta.split('.');
    const ultimo = partes.pop()!;
    let o = obj;
    for (const parte of partes) {
        if (!o || typeof o !== 'object' || !Object.prototype.hasOwnProperty.call(o, parte)) return;
        o = o[parte];
    }
    if (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, ultimo)) delete o[ultimo];
}

/**
 * Saca `__visto` y `__decision` del cuerpo (lo cambia en el sitio) y devuelve
 * los choques que hay que preguntar; vacío si no hay nada que preguntar.
 * `actual` es lo guardado ahora, con los mismos nombres que el cuerpo.
 */
export async function revisarLoVisto(cuerpo: any, leerActual: () => Promise<unknown>): Promise<ChoqueDeCampo[]> {
    if (!cuerpo || typeof cuerpo !== 'object') return [];
    const visto = cuerpo.__visto;
    const decision = cuerpo.__decision;
    delete cuerpo.__visto;
    delete cuerpo.__decision;
    if (!Array.isArray(visto) || !visto.length) return [];

    const lista = visto.slice(0, 300).filter((v: any): v is Visto => v && typeof v === 'object' && rutaValida(v.campo));
    const tocados = lista.filter((v) => !igual(v.antes, v.nuevo));
    for (const v of lista) if (igual(v.antes, v.nuevo)) quitarCampo(cuerpo, v.campo);
    if (!tocados.length || decision === 'lo-mio') return [];

    const actual = await leerActual();
    const choques: ChoqueDeCampo[] = [];
    for (const v of tocados) {
        const ahora = leerCampo(actual, v.campo);
        if (!igual(ahora, v.antes) && !igual(ahora, v.nuevo)) choques.push({ campo: v.campo, antes: v.antes, ahora, tuyo: v.nuevo });
    }
    return choques;
}
