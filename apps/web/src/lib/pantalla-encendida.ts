/**
 * QUE LA PANTALLA NO SE APAGUE
 *
 * El profesor deja el teléfono sobre la mesa con el QR a la vista. A los 30 s
 * el teléfono se apagaba y los alumnos escaneaban una pantalla negra.
 *
 * En la app lo hace Android (`AsistenciaQrPlugin.pantallaEncendida`); en un
 * navegador, el «wake lock» del navegador, que no todos tienen. Devuelve con qué
 * soltarlo.
 */

type PluginDePantalla = { pantallaEncendida?: (o: { encendida: boolean }) => Promise<void> };

function elPlugin(): PluginDePantalla | null {
    if (typeof window === 'undefined') return null;
    const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
    return (cap?.Plugins?.AsistenciaQr as PluginDePantalla | undefined) ?? null;
}

export function mantenerLaPantallaEncendida(): () => void {
    const plugin = elPlugin();
    if (plugin?.pantallaEncendida) {
        void plugin.pantallaEncendida({ encendida: true }).catch(() => undefined);
        return () => void plugin.pantallaEncendida?.({ encendida: false }).catch(() => undefined);
    }

    let cerrojo: { release: () => Promise<void> } | null = null;
    let vivo = true;
    const pedir = async () => {
        try {
            const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
            if (wl && document.visibilityState === 'visible') cerrojo = await wl.request('screen');
        } catch {
            // Sin wake lock: la pantalla se apagará como siempre.
        }
    };
    // El navegador lo suelta al cambiar de pestaña: se vuelve a pedir al volver.
    const alVolver = () => {
        if (vivo && document.visibilityState === 'visible') void pedir();
    };
    void pedir();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
        vivo = false;
        document.removeEventListener('visibilitychange', alVolver);
        void cerrojo?.release().catch(() => undefined);
    };
}
