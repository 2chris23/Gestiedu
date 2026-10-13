/**
 * EL COLOR DE LA APP (octubre 2026)
 *
 * Cada persona elige el color de SU app en «Mi cuenta» (o en el menú de su
 * nombre, en el ordenador): Azul (el de siempre), Turquesa, Violeta, Amarillo
 * o Coral. Es una preferencia de quien mira, no del liceo: se guarda en el
 * aparato.
 *
 * Al principio el color solo cambiaba el acento (el botón de Inicio, la marca
 * de hoy); desde el 13-oct-2026 cambia también la cabecera —la barra lateral,
 * la franja del Inicio, la cabecera del teléfono— y todo lo que se pulsa
 * (`indigo-*`): lo pidió Cristian. Los colores y sus cuentas viven en
 * `paleta-de-colores.js`, que los convierte en variables CSS por cada
 * `<html data-acento="…">`; aquí solo se elige cuál.
 */

/** Los mismos de `paleta-de-colores.js` (una prueba compara las dos listas). */
export const ACENTOS = {
    azul: { nombre: 'Azul', color: '#0D47A1' },
    turquesa: { nombre: 'Turquesa', color: '#00594F' },
    violeta: { nombre: 'Violeta', color: '#5B21B6' },
    amarillo: { nombre: 'Amarillo', color: '#FBC02D' },
    coral: { nombre: 'Coral', color: '#A12D08' },
} as const;

export type Acento = keyof typeof ACENTOS;
export const ACENTO_POR_DEFECTO: Acento = 'azul';
const LLAVE = 'gestiedu:color-de-la-app';
export const CAMBIO_DE_COLOR = 'gestiedu:cambio-de-color';

export function esAcento(v: unknown): v is Acento {
    return typeof v === 'string' && v in ACENTOS;
}

export function acentoGuardado(): Acento {
    try {
        const v = localStorage.getItem(LLAVE);
        return esAcento(v) ? v : ACENTO_POR_DEFECTO;
    } catch {
        return ACENTO_POR_DEFECTO;
    }
}

export function aplicarAcento(acento: Acento): void {
    document.documentElement.dataset.acento = acento;
}

export function elegirAcento(acento: Acento): void {
    try {
        localStorage.setItem(LLAVE, acento);
    } catch {
        // Sin almacén (modo privado): vale para esta visita.
    }
    aplicarAcento(acento);
    window.dispatchEvent(new CustomEvent(CAMBIO_DE_COLOR, { detail: acento }));
}

/**
 * El color de la cabecera AHORA (con el color y el modo de quien mira): lo
 * necesitan la franja del reloj del teléfono y el `theme-color`, que no leen
 * variables CSS.
 */
export function colorDeLaCabecera(): string {
    if (typeof window === 'undefined') return ACENTOS[ACENTO_POR_DEFECTO].color;
    // El de arriba de la franja del Inicio: en claro es la cabecera; en
    // oscuro, el color elegido oscurecido (como Rial).
    const v = getComputedStyle(document.documentElement).getPropertyValue('--franja-arriba').trim();
    return v || ACENTOS[ACENTO_POR_DEFECTO].color;
}

/**
 * Lo mismo, antes de pintar: un guion de una línea en el <head> pone la marca
 * del color guardado antes de que React arranque, para que no se vea un
 * parpadeo del azul al color elegido.
 */
export const COLOR_ANTES_DE_PINTAR = `(function(){try{var a=localStorage.getItem(${JSON.stringify(LLAVE)});if(${JSON.stringify(
    Object.keys(ACENTOS)
)}.indexOf(a)>=0)document.documentElement.setAttribute('data-acento',a);}catch(e){}})();`;
