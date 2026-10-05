/**
 * EL COLOR DE LA APP (octubre 2026)
 *
 * Azul de cabecera fijo (#0D47A1) y un color de acento que elige cada
 * persona en «Mi cuenta»: Turquesa, Violeta, Amarillo o Coral (el diseño de
 * Cristian, «Panel Admin — App móvil»). Es una preferencia de quien mira, no
 * del liceo: se guarda en el teléfono.
 *
 * Todo lo que lleva el acento lee variables CSS (`--acento`, …), así que
 * cambiar de color es cambiar cinco variables, sin volver a pintar nada a mano.
 * Las cuentas (suave, hondo, texto encima) son las del diseño original.
 */

export const AZUL_CABECERA = '#0D47A1';

export const ACENTOS = {
    turquesa: { nombre: 'Turquesa', color: '#00BFA5' },
    violeta: { nombre: 'Violeta', color: '#7C3AED' },
    amarillo: { nombre: 'Amarillo', color: '#FBC02D' },
    coral: { nombre: 'Coral', color: '#FF7043' },
} as const;

export type Acento = keyof typeof ACENTOS;
export const ACENTO_POR_DEFECTO: Acento = 'turquesa';
const LLAVE = 'gestiedu:color-de-la-app';
export const CAMBIO_DE_COLOR = 'gestiedu:cambio-de-color';

export function esAcento(v: unknown): v is Acento {
    return typeof v === 'string' && v in ACENTOS;
}

/** Las cinco variables de un acento, como en el diseño. */
export function variablesDe(acento: Acento): Record<string, string> {
    const hex = ACENTOS[acento].color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const lin = (c: number) => {
        const x = c / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const luz = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return {
        '--acento': `#${hex}`,
        '--acento-suave': `rgba(${r},${g},${b},0.16)`,
        '--acento-hondo': `rgb(${Math.round(r * 0.52)},${Math.round(g * 0.52)},${Math.round(b * 0.52)})`,
        // Sobre un acento claro (amarillo, turquesa) el texto va oscuro.
        '--sobre-acento': luz > 0.3 ? '#0B1B33' : '#FFFFFF',
        '--azul-cabecera': AZUL_CABECERA,
    };
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
    const raiz = document.documentElement;
    for (const [k, v] of Object.entries(variablesDe(acento))) raiz.style.setProperty(k, v);
    raiz.dataset.acento = acento;
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
 * Lo mismo, antes de pintar: un guion de una línea en el <head> pone el color
 * guardado antes de que React arranque, para que no se vea un parpadeo del
 * turquesa al color elegido.
 */
export const COLOR_ANTES_DE_PINTAR = `(function(){try{var t=${JSON.stringify(
    Object.fromEntries((Object.keys(ACENTOS) as Acento[]).map((a) => [a, variablesDe(a)]))
)};var a=localStorage.getItem(${JSON.stringify(LLAVE)});var v=t[a];if(!v)return;var r=document.documentElement;for(var k in v)r.style.setProperty(k,v[k]);r.dataset.acento=a;}catch(e){}})();`;
