/**
 * EL MODO OSCURO (octubre 2026)
 *
 * Cristian: «quiero un modo oscuro que se vea como Spotify». Cada persona
 * elige en su aparato: Claro, Oscuro o «Como el teléfono» (lo que diga el
 * sistema, y cambia solo si el teléfono cambia, de noche por ejemplo). La
 * primera vez sale Claro, como siempre.
 *
 * Solo pone o quita la clase `dark` del `<html>`: los colores oscuros los
 * pone `paleta-de-colores.js`. Un guion del `<head>` lo hace antes de pintar,
 * para que una app oscura no abra con un fogonazo blanco.
 */

export const MODOS = {
    claro: 'Claro',
    oscuro: 'Oscuro',
    sistema: 'Como el teléfono',
} as const;

export type Modo = keyof typeof MODOS;
export const MODO_POR_DEFECTO: Modo = 'claro';
const LLAVE = 'gestiedu:modo-de-la-app';
export const CAMBIO_DE_MODO = 'gestiedu:cambio-de-modo';
const CONSULTA = '(prefers-color-scheme: dark)';

export function esModo(v: unknown): v is Modo {
    return typeof v === 'string' && v in MODOS;
}

export function modoGuardado(): Modo {
    try {
        const v = localStorage.getItem(LLAVE);
        return esModo(v) ? v : MODO_POR_DEFECTO;
    } catch {
        return MODO_POR_DEFECTO;
    }
}

/** ¿Se ve oscuro con este modo? «Como el teléfono» lo pregunta al sistema. */
export function esOscuro(modo: Modo): boolean {
    if (modo === 'oscuro') return true;
    if (modo === 'claro') return false;
    try {
        return window.matchMedia(CONSULTA).matches;
    } catch {
        return false;
    }
}

export function aplicarModo(modo: Modo): void {
    document.documentElement.classList.toggle('dark', esOscuro(modo));
}

export function elegirModo(modo: Modo): void {
    try {
        localStorage.setItem(LLAVE, modo);
    } catch {
        // Sin almacén (modo privado): vale para esta visita.
    }
    aplicarModo(modo);
    window.dispatchEvent(new CustomEvent(CAMBIO_DE_MODO, { detail: modo }));
}

/**
 * Con «Como el teléfono», si el sistema cambia mientras la app está abierta,
 * la app cambia con él. Devuelve cómo dejar de escuchar.
 */
export function seguirAlSistema(): () => void {
    let consulta: MediaQueryList;
    try {
        consulta = window.matchMedia(CONSULTA);
    } catch {
        return () => {};
    }
    const alCambiar = () => {
        if (modoGuardado() !== 'sistema') return;
        aplicarModo('sistema');
        window.dispatchEvent(new CustomEvent(CAMBIO_DE_MODO, { detail: 'sistema' }));
    };
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
}

/** Antes de pintar (en el `<head>`), lo mismo que `aplicarModo`. */
export const MODO_ANTES_DE_PINTAR = `(function(){try{var m=localStorage.getItem(${JSON.stringify(
    LLAVE
)});var o=m==='oscuro'||(m==='sistema'&&window.matchMedia(${JSON.stringify(CONSULTA)}).matches);if(o)document.documentElement.classList.add('dark');}catch(e){}})();`;
