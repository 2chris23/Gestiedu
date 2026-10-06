/**
 * EL CANDADO DE LA APP (octubre 2026)
 *
 * Un profesor deja el teléfono desbloqueado y un alumno abre la app: entraba
 * directo, porque la sesión sigue abierta. Ahora, en la app del teléfono, al
 * abrirla y al volver a ella pasado un rato, sale la pantalla de bloqueo y
 * «Ingresar» pide la huella o, si no, el patrón / PIN / contraseña DEL
 * TELÉFONO (el diálogo de Android). Si el teléfono no tiene ningún bloqueo,
 * el PIN de 4 números de la app (`pin-de-la-app.ts`).
 *
 * Es la puerta de la casa, como en el banco: protege del que coge el
 * teléfono. La caja fuerte sigue siendo el servidor (cada petición pasa por
 * sus guardianes, con candado o sin él).
 *
 * Solo en la app (la APK). En el navegador no hay con qué preguntar al
 * teléfono quién es, y fingirlo sería peor que no tenerlo.
 */

type Capacitor = { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };

function capacitor(): Capacitor | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { Capacitor?: Capacitor }).Capacitor;
}

/** ¿Corre dentro de la app del teléfono? */
export function esLaApp(): boolean {
    return Boolean(capacitor()?.isNativePlatform?.());
}

// ── Cuánto se puede estar fuera sin que pida de nuevo ──────────────────────

export const TIEMPOS_DE_BLOQUEO = [
    { valor: 0, nombre: 'Al instante' },
    { valor: 60_000, nombre: '1 minuto' },
    { valor: 5 * 60_000, nombre: '5 minutos' },
    { valor: 15 * 60_000, nombre: '15 minutos' },
] as const;

export const TIEMPO_POR_DEFECTO = 60_000;
const LLAVE_TIEMPO = 'gestiedu:bloquear-al-volver';

export function tiempoDeBloqueo(): number {
    try {
        const v = Number(localStorage.getItem(LLAVE_TIEMPO));
        return TIEMPOS_DE_BLOQUEO.some((t) => t.valor === v) && localStorage.getItem(LLAVE_TIEMPO) !== null ? v : TIEMPO_POR_DEFECTO;
    } catch {
        return TIEMPO_POR_DEFECTO;
    }
}

export function elegirTiempoDeBloqueo(ms: number): void {
    try {
        localStorage.setItem(LLAVE_TIEMPO, String(ms));
    } catch {
        /* sin almacén: vale el de por defecto */
    }
}

// ── El estado del candado en ESTA apertura de la app ───────────────────────
//
// `sessionStorage` vive mientras vive la app (una recarga no la vacía; cerrar
// la app del todo, sí). Así una recarga —la app que se pone al día— no pide la
// huella otra vez, y abrirla en frío siempre.

const LLAVE_ESTADO = 'gestiedu:candado';

interface Estado {
    abierto: boolean;
    /** Cuándo se fue a segundo plano (reloj del teléfono), o null si está delante. */
    salioEn: number | null;
}

function leer(): Estado {
    try {
        const e = JSON.parse(sessionStorage.getItem(LLAVE_ESTADO) || 'null');
        if (e && typeof e.abierto === 'boolean') return e;
    } catch {
        /* nada */
    }
    return { abierto: false, salioEn: null };
}

function escribir(e: Estado) {
    try {
        sessionStorage.setItem(LLAVE_ESTADO, JSON.stringify(e));
    } catch {
        /* sin almacén: pedirá más a menudo, nunca menos */
    }
}

/** ¿Hay que pedir la huella ahora? (al abrir la app o al volver a ella). */
export function hayQuePedir(ahora = Date.now()): boolean {
    const e = leer();
    if (!e.abierto) return true;
    if (e.salioEn === null) return false;
    // Un reloj que va hacia atrás (alguien lo cambió) cuenta como mucho tiempo fuera.
    const fuera = ahora - e.salioEn;
    return fuera < 0 || fuera > tiempoDeBloqueo() || (tiempoDeBloqueo() === 0 && fuera >= 0);
}

export function abrirElCandado(): void {
    escribir({ abierto: true, salioEn: null });
}

export function cerrarElCandado(): void {
    escribir({ abierto: false, salioEn: null });
}

/** La app se va a segundo plano: se apunta cuándo. */
export function apuntarQueSalio(ahora = Date.now()): void {
    const e = leer();
    if (e.abierto && e.salioEn === null) escribir({ ...e, salioEn: ahora });
}

/** Volvió antes de tiempo: sigue abierta. */
export function apuntarQueVolvio(): void {
    const e = leer();
    if (e.abierto) escribir({ abierto: true, salioEn: null });
}

// ── Preguntarle al teléfono si es su dueño ─────────────────────────────────

interface PluginDeHuella {
    isAvailable: (o?: { useFallback?: boolean }) => Promise<{ isAvailable: boolean }>;
    verifyIdentity: (o: Record<string, unknown>) => Promise<void>;
}

function laHuella(): PluginDeHuella | null {
    const plugin = capacitor()?.Plugins?.NativeBiometric as PluginDeHuella | undefined;
    return plugin?.verifyIdentity ? plugin : null;
}

/**
 * Mientras sale el diálogo de Android, la app pasa a segundo plano (es otra
 * pantalla). Con «al instante», eso volvería a cerrar el candado en bucle.
 */
let verificando = false;
export const estaVerificando = () => verificando;

/** ¿Tiene el teléfono huella, cara, patrón, PIN o contraseña? */
export async function elTelefonoTieneBloqueo(): Promise<boolean> {
    const plugin = laHuella();
    if (!plugin) return false;
    try {
        const { isAvailable } = await plugin.isAvailable({ useFallback: true });
        return Boolean(isAvailable);
    } catch {
        return false;
    }
}

export type Resultado = 'ok' | 'cancelado' | 'sin-bloqueo';

/**
 * La huella o, si no se puede, el patrón / PIN / contraseña del teléfono, en
 * el mismo diálogo de Android (`useFallback`). `sin-bloqueo` si el teléfono no
 * tiene ninguno: entonces va el PIN de la app.
 */
export async function verificarQueEsElDueno(liceo: string): Promise<Resultado> {
    const plugin = laHuella();
    if (!plugin || !(await elTelefonoTieneBloqueo())) return 'sin-bloqueo';
    verificando = true;
    try {
        await plugin.verifyIdentity({
            title: 'Ingresar',
            subtitle: liceo || 'Gestiedu',
            description: 'Usa tu huella o el bloqueo de tu teléfono',
            useFallback: true,
            maxAttempts: 5,
        });
        return 'ok';
    } catch {
        return 'cancelado';
    } finally {
        // El regreso de la pantalla de Android llega un instante después.
        setTimeout(() => {
            verificando = false;
        }, 1500);
    }
}

/** Esconde el icono de arranque de Android (lo deja puesto `SplashScreen`). */
export function esconderElIconoDeArranque(): void {
    const plugin = capacitor()?.Plugins?.SplashScreen as { hide?: (o?: unknown) => Promise<void> | void } | undefined;
    try {
        void Promise.resolve(plugin?.hide?.({ fadeOutDuration: 200 })).catch(() => undefined);
    } catch {
        /* sin icono que esconder */
    }
}

/** Avisa cuando la app se va o vuelve (la de Capacitor y la del navegador). */
export function alSalirYVolver(alSalir: () => void, alVolver: () => void): () => void {
    const vis = () => (document.visibilityState === 'hidden' ? alSalir() : alVolver());
    document.addEventListener('visibilitychange', vis);
    const app = capacitor()?.Plugins?.App as
        | { addListener?: (e: string, f: (s: { isActive: boolean }) => void) => Promise<{ remove: () => void }> | { remove: () => void } }
        | undefined;
    let quitar: (() => void) | null = null;
    let quitado = false;
    // Dentro de la APK, `addListener` NO devuelve una promesa: devuelve el
    // oyente ya puesto. Un `.then` a pelo tiraba la app entera al abrirla
    // («This page couldn't load», 1.10). Siempre con `Promise.resolve`.
    try {
        void Promise.resolve(app?.addListener?.('appStateChange', (s) => (s.isActive ? alVolver() : alSalir())))
            .then((h) => {
                if (!h) return;
                if (quitado) h.remove();
                else quitar = () => h.remove();
            })
            .catch(() => undefined);
    } catch {
        /* sin el complemento: queda `visibilitychange` */
    }
    return () => {
        quitado = true;
        document.removeEventListener('visibilitychange', vis);
        quitar?.();
    };
}
