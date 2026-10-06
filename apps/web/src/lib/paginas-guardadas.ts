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
 * Igual, pero esperando a que acabe (la precarga): cuántas quedaron
 * guardadas. Sin ayudante (desarrollo, un navegador viejo), 0 al momento.
 */
export async function guardarEstasPaginasYEsperar(direcciones: string[], tope = 120_000): Promise<number> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 0;
    const registro = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]).catch(() => null);
    const activo = registro?.active;
    if (!activo) return 0;
    return new Promise<number>((resolver) => {
        const canal = new MessageChannel();
        const corte = setTimeout(() => resolver(0), tope);
        canal.port1.onmessage = (e) => {
            clearTimeout(corte);
            resolver(Number(e.data?.guardadas) || 0);
        };
        activo.postMessage({ tipo: 'guardar-pagina', direcciones }, [canal.port2]);
    });
}

/** Que mire si hay una versión nueva de la app y la baje en segundo plano. */
export function mirarLaVersionDeLaApp(): void {
    alAyudante({ tipo: 'mirar-version' });
}

/**
 * Lo mismo, esperando a que acabe: la cáscara de la app (su javascript y sus
 * estilos) entera en el teléfono. La precarga, al ir más rápida que la
 * cáscara, acababa antes, y sin conexión algunas partes decían «no está
 * guardada» (PRECARGA-01). Sin ayudante, o pasado el tope, sigue sin esperar.
 */
export async function mirarLaVersionDeLaAppYEsperar(tope = 120_000): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const registro = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]).catch(() => null);
    const activo = registro?.active;
    if (!activo) return;
    await new Promise<void>((resolver) => {
        const canal = new MessageChannel();
        const corte = setTimeout(resolver, tope);
        canal.port1.onmessage = () => {
            clearTimeout(corte);
            resolver();
        };
        activo.postMessage({ tipo: 'mirar-version' }, [canal.port2]);
    });
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
