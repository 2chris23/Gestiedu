/**
 * LAS PANTALLAS QUE EL AYUDANTE GUARDA ENTERAS
 *
 * El ayudante (`public/sw.js`) es quien las guarda; esto solo le avisa. Ver
 * `guardarLaPagina` allí: dentro de la app se navega sin recargar, y sin este
 * aviso ninguna pantalla quedaba guardada para abrirla sin conexión.
 */

function alAyudante(mensaje: Record<string, unknown>): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
        .then((registro) => registro.active?.postMessage(mensaje))
        .catch(() => {
            // Sin ayudante no se guarda nada: la app funciona igual con conexión.
        });
}

/** Que guarde estas pantallas (una vez cada diez minutos como mucho). */
export function guardarEstasPaginas(direcciones: string[]): void {
    alAyudante({ tipo: 'guardar-pagina', direcciones });
}

/**
 * Al cerrar sesión: una pantalla guardada lleva el nombre de quien la abrió, y
 * lo que guarda el ayudante es del navegador, no de la persona. Se queda la
 * cáscara (el javascript, los estilos), que es igual para todos.
 */
export function olvidarLasPaginasGuardadas(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
        .getRegistration()
        .then((registro) => registro?.active?.postMessage({ tipo: 'olvidar-paginas' }))
        .catch(() => {});
}
