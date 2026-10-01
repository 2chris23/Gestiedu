/**
 * GIRAR EL TELÉFONO, A PROPÓSITO
 *
 * Hay dos pantallas que no caben de pie y no es culpa del diseño: el horario
 * —cinco días por siete horas— y el plan de evaluación —diez columnas por
 * dieciocho semanas—. En un móvil de 390 px eso son 700 y 1000 px de tabla.
 *
 * Se puede enseñar de otra forma (y se enseña: ver `HorarioPorDias`), pero para
 * TRABAJAR con la rejilla entera —mover una materia de hueco, repasar la semana
 * completa— hace falta el ancho. Y el ancho existe: es el mismo teléfono
 * tumbado, 844 px en vez de 390.
 *
 * Así que en vez de pelear con el espacio, se pide el giro. Y se pide, no se
 * impone: quien tenga el giro bloqueado o prefiera no girar sigue teniendo la
 * vista por días, que es completa.
 *
 * ─── POR QUÉ NO ES UNA SOLA LÍNEA ───────────────────────────────────────────
 *
 * Dentro de la APK lo hace Capacitor (`ScreenOrientation`), que puede fijar la
 * orientación de verdad. En un navegador, `screen.orientation.lock()` solo
 * funciona a pantalla completa y en Android; en un iPhone no existe. Por eso
 * esto devuelve si ha podido o no, y quien lo llama enseña un aviso —«gira el
 * teléfono»— cuando no.
 */

type PluginDeGiro = {
    lock?: (opciones: { orientation: string }) => Promise<void>;
    unlock?: () => Promise<void>;
};

function elPluginDeCapacitor(): PluginDeGiro | null {
    if (typeof window === 'undefined') return null;
    const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
    const plugin = cap?.Plugins?.ScreenOrientation as PluginDeGiro | undefined;
    return plugin?.lock ? plugin : null;
}

/** ¿Se puede pedir el giro aquí, o solo cabe sugerirlo? */
export function sePuedeGirar(): boolean {
    if (typeof window === 'undefined') return false;
    if (elPluginDeCapacitor()) return true;
    const orientacion = window.screen?.orientation as (ScreenOrientation & { lock?: unknown }) | undefined;
    return typeof orientacion?.lock === 'function';
}

/** ¿Está el teléfono tumbado ahora mismo? */
export function estaTumbado(): boolean {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia) return window.matchMedia('(orientation: landscape)').matches;
    return window.innerWidth > window.innerHeight;
}

/**
 * Pide poner la pantalla en horizontal.
 * @returns `true` si se ha podido; `false` si toca girar el teléfono a mano.
 */
export async function aHorizontal(): Promise<boolean> {
    const plugin = elPluginDeCapacitor();
    if (plugin?.lock) {
        try {
            await plugin.lock({ orientation: 'landscape' });
            return true;
        } catch {
            return false;
        }
    }

    const orientacion = window.screen?.orientation as
        | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
        | undefined;
    if (typeof orientacion?.lock !== 'function') return false;

    try {
        // En un navegador de Android esto solo vale a pantalla completa. Se
        // pide, y si el navegador dice que no, se devuelve false y quien llama
        // enseña el aviso de girar a mano.
        if (document.fullscreenElement == null && document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen().catch(() => {});
        }
        await orientacion.lock('landscape');
        return true;
    } catch {
        return false;
    }
}

/** Deshace lo anterior: la pantalla vuelve a girar con el teléfono. */
export async function soltarLaPantalla(): Promise<void> {
    const plugin = elPluginDeCapacitor();
    if (plugin?.unlock) {
        await plugin.unlock().catch(() => {});
    } else {
        const orientacion = window.screen?.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined;
        try {
            orientacion?.unlock?.();
        } catch {
            // Da igual: la pantalla se queda como estaba.
        }
    }

    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
    }
}
