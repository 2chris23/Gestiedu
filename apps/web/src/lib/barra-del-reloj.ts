/**
 * LA FRANJA DEL RELOJ, DEL COLOR DE LA CABECERA
 *
 * El Inicio del admin en el teléfono tiene la cabecera azul, y la franja del
 * reloj tiene que seguirla. Quién la pinta depende de dónde corre la app:
 *
 *   · en la APK, Android (`BarraDelRelojPlugin.java`): la página no llega ahí;
 *   · instalada desde el navegador, el `theme-color` de la página.
 *
 * Sin color, cada uno vuelve al de siempre. Una APK de antes del complemento
 * no lo tiene y se queda blanca: no se rompe nada.
 */
const COLOR_DE_SIEMPRE = '#f5f6f9';

type Capacitor = { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
interface PluginBarra {
    pintar: (o: { color?: string; iconosClaros?: boolean }) => Promise<void>;
}

export function pintarLaBarraDelReloj(color: string | null): void {
    if (typeof window === 'undefined') return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = color ?? COLOR_DE_SIEMPRE;

    const cap = (window as unknown as { Capacitor?: Capacitor }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const plugin = cap.Plugins?.BarraDelReloj as PluginBarra | undefined;
    plugin?.pintar(color ? { color, iconosClaros: true } : {}).catch(() => {
        /* APK vieja o color raro: se queda la de siempre */
    });
}
