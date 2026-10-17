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

/*
 * ─── DE PIE SIEMPRE, SALVO DONDE SE PIDE ────────────────────────────────────
 *
 * Cristian (16-oct-2026): en el teléfono la app va siempre de pie y no se
 * voltea; solo se deja girar al editar el horario y al ver (o editar) el plan
 * de evaluación. Lo fija la APK (`ScreenOrientation`) y la app instalada desde
 * el navegador (`screen.orientation.lock`, que ahí sí vale); en una pestaña
 * normal del navegador nadie puede fijarlo, y se deja como está.
 *
 * Las pantallas que dejan girar lo piden con `useDejarGirar()`: se cuentan,
 * para que al cerrar una ventana que dejaba girar dentro de otra pantalla que
 * también lo deja, la pantalla no se quede clavada de pie.
 */
let permisos = 0;

function esLaAppInstalada(): boolean {
    if (typeof window === 'undefined') return false;
    return !!window.matchMedia?.('(display-mode: standalone)').matches || !!window.matchMedia?.('(display-mode: fullscreen)').matches;
}

async function bloquear(orientacion: 'portrait' | 'any'): Promise<void> {
    const plugin = elPluginDeCapacitor();
    if (plugin) {
        if (orientacion === 'any') await plugin.unlock?.().catch(() => {});
        else await plugin.lock?.({ orientation: 'portrait' }).catch(() => {});
        return;
    }
    if (!esLaAppInstalada()) return;
    const o = window.screen?.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    await o?.lock?.(orientacion).catch(() => {});
}

/** La app, de pie (si ninguna pantalla abierta deja girar). */
export async function fijarVertical(): Promise<void> {
    if (permisos > 0) return;
    await bloquear('portrait');
}

/** Esta pantalla deja girar; devuelve con qué devolverla a de pie. */
export function dejarGirar(): () => void {
    permisos += 1;
    void bloquear('any');
    let hecho = false;
    return () => {
        if (hecho) return;
        hecho = true;
        permisos = Math.max(0, permisos - 1);
        void fijarVertical();
    };
}

/** Deshace lo anterior: la pantalla vuelve a girar con el teléfono (o de pie, si aquí no se deja girar). */
export async function soltarLaPantalla(): Promise<void> {
    if (permisos > 0) await bloquear('any');
    else await bloquear('portrait');

    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
    }
}
