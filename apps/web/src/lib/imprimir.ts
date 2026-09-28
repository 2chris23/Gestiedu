/**
 * IMPRIMIR, EN EL NAVEGADOR Y EN LA APP
 *
 * En el navegador (y en la app instalada desde él), `window.print()`. En la
 * APK no hace nada —el WebView de Android no trae el diálogo de imprimir—, así
 * que se le pide al complemento nativo (`ImprimirPlugin.java`), que abre el
 * mismo diálogo de Android con «Guardar como PDF».
 *
 * Una APK de antes de este complemento no lo tiene: se dice que hay que
 * actualizar la app, en vez de no hacer nada.
 */
interface PluginImprimir {
    imprimir: (o: { nombre: string }) => Promise<void>;
}

type Capacitor = { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };

export async function imprimir(): Promise<'impreso' | 'actualizar'> {
    const cap = typeof window !== 'undefined' ? (window as unknown as { Capacitor?: Capacitor }).Capacitor : undefined;
    if (cap?.isNativePlatform?.()) {
        const plugin = cap.Plugins?.Imprimir as PluginImprimir | undefined;
        if (!plugin?.imprimir) return 'actualizar';
        await plugin.imprimir({ nombre: document.title || 'Documento' });
        return 'impreso';
    }
    window.print();
    return 'impreso';
}
