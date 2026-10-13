/**
 * LA BARRA LATERAL, ABIERTA O RECOGIDA (octubre 2026)
 *
 * Cristian: que se pueda ocultar con un efecto suave. Recogida se queda en
 * una columna de iconos (no desaparece: se sigue navegando sin abrirla).
 *
 * El estado vive en `<html data-lateral="recogida">`, no en React: así lo
 * leen el CSS (`--ancho-lateral` en globals.css, la variante `recogida:`) y
 * el guion del <head> que lo pone ANTES de pintar. Con un `useState`, la
 * página llegaba abierta del servidor y se cerraba delante de quien la
 * miraba. Es una comodidad de cada navegador: se guarda en él y, si no deja
 * guardar (modo privado), la barra sale abierta.
 *
 * Sin React aquí, a propósito: el guion lo importa `app/layout.tsx`, que es
 * del servidor, y un gancho de React en el mismo archivo tumbaba la app
 * entera. El gancho vive en `hooks/useBarraRecogida.ts`.
 */

const LLAVE = 'gestiedu:barra-lateral';
export const CAMBIO_DE_LATERAL = 'gestiedu:cambio-de-lateral';

export const LATERAL_ANTES_DE_PINTAR = `(function(){try{if(localStorage.getItem(${JSON.stringify(
    LLAVE
)})==='recogida')document.documentElement.dataset.lateral='recogida';}catch(e){}})();`;

export function estaRecogida(): boolean {
    return document.documentElement.dataset.lateral === 'recogida';
}

/**
 * `alInstante`: con el teclado no se anima (se hace muchas veces al día y
 * tiene que sentirse inmediato). El atributo apaga la transición dos cuadros.
 */
export function recogerLaBarra(recogida: boolean, { alInstante = false }: { alInstante?: boolean } = {}): void {
    const raiz = document.documentElement;
    if (alInstante) raiz.dataset.lateralAlInstante = '';
    if (recogida) raiz.dataset.lateral = 'recogida';
    else delete raiz.dataset.lateral;
    try {
        localStorage.setItem(LLAVE, recogida ? 'recogida' : 'abierta');
    } catch {
        // Sin almacén: vale para esta visita.
    }
    window.dispatchEvent(new Event(CAMBIO_DE_LATERAL));
    if (alInstante) requestAnimationFrame(() => requestAnimationFrame(() => delete raiz.dataset.lateralAlInstante));
}

/** Ctrl+B (⌘B), salvo escribiendo: ahí es la negrita. */
export function esElAtajoDeLaBarra(e: KeyboardEvent): boolean {
    if (e.key.toLowerCase() !== 'b' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
    const donde = e.target as HTMLElement | null;
    if (!donde) return true;
    const etiqueta = donde.tagName;
    return !(etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT' || donde.isContentEditable);
}
