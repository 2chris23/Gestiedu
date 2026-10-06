import api from '@/lib/axios';

/**
 * LOS AVISOS AL TELÉFONO, CON LA APP CERRADA
 *
 * Dos caminos, porque Android no deja otro:
 *
 *   - **La app instalada desde el navegador (y el navegador): Web Push.** El
 *     ayudante (`public/sw.js`) enseña el aviso. La dirección la da el
 *     navegador; el servidor firma con sus llaves VAPID.
 *   - **La APK: Firebase.** El WebView de la APK no recibe Web Push; el plugin
 *     `PushNotifications` de Capacitor da un token de Firebase. Solo si el
 *     servidor tiene Firebase (`preferencias.firebase`): sin su archivo
 *     `google-services.json` la APK no sabe hablar con Firebase.
 *
 * Lo apuntado se recuerda en este teléfono (`DESTINO`) para BORRARLO al cerrar
 * sesión: un teléfono prestado no recibe los avisos del anterior. En iPhone,
 * Web Push solo funciona con la app añadida a la pantalla de inicio.
 */

export interface PreferenciasDeAvisos {
    alTelefono: boolean;
    /** La llave pública VAPID del servidor, o null si no tiene. */
    webPush: string | null;
    firebase: boolean;
}

export type EstadoDelPermiso = 'concedido' | 'denegado' | 'sin-preguntar' | 'no-se-puede';

const DESTINO = 'gestiedu:aviso-destino';

type PluginDeAvisos = {
    checkPermissions: () => Promise<{ receive: string }>;
    requestPermissions: () => Promise<{ receive: string }>;
    register: () => Promise<void>;
    addListener: (evento: string, fn: (d: any) => void) => Promise<{ remove: () => void }> | { remove: () => void };
};

function capacitor(): { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } | null {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { Capacitor?: any }).Capacitor ?? null;
}

/** ¿Estamos dentro de la APK? */
export const enLaApk = (): boolean => Boolean(capacitor()?.isNativePlatform?.());

const pluginDeLaApk = (): PluginDeAvisos | null => (capacitor()?.Plugins?.PushNotifications as PluginDeAvisos | undefined) ?? null;

const guardar = (destino: string | null) => {
    try {
        if (destino) localStorage.setItem(DESTINO, destino);
        else localStorage.removeItem(DESTINO);
    } catch {
        /* sin almacenamiento: al cerrar sesión no se podrá borrar desde aquí; caduca solo si el servicio lo da por muerto */
    }
};
const guardado = (): string | null => {
    try {
        return localStorage.getItem(DESTINO);
    } catch {
        return null;
    }
};

export async function preferenciasDeAvisos(): Promise<PreferenciasDeAvisos> {
    return (await api.get('/avisos/preferencias')).data.data;
}

/** Cómo está el permiso de avisos en este teléfono. */
export async function estadoDelPermiso(pref?: PreferenciasDeAvisos | null): Promise<EstadoDelPermiso> {
    if (enLaApk()) {
        const plugin = pluginDeLaApk();
        if (!plugin || (pref && !pref.firebase)) return 'no-se-puede';
        const { receive } = await plugin.checkPermissions();
        return receive === 'granted' ? 'concedido' : receive === 'denied' ? 'denegado' : 'sin-preguntar';
    }
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        return 'no-se-puede';
    }
    if (pref && !pref.webPush) return 'no-se-puede';
    return Notification.permission === 'granted' ? 'concedido' : Notification.permission === 'denied' ? 'denegado' : 'sin-preguntar';
}

/** «BPk…» (base64 url) → los bytes que pide `pushManager.subscribe`. */
function llaveEnBytes(base64: string): Uint8Array {
    const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
    const b = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/**
 * Apunta este teléfono para recibir los avisos de quien tiene la sesión.
 * `preguntar`: si aún no dio permiso, se le pregunta (solo tras tocar un botón).
 * Devuelve cómo quedó.
 */
export async function apuntarEsteTelefono(preguntar: boolean): Promise<EstadoDelPermiso> {
    const pref = await preferenciasDeAvisos();
    let estado = await estadoDelPermiso(pref);
    if (estado === 'no-se-puede') return estado;

    if (enLaApk()) {
        // En la APK el teléfono se apunta SIEMPRE, con permiso o sin él: el
        // toque silencioso («lo tuyo cambió, ponte al día») es un mensaje de
        // datos y Android no pide permiso para eso. Sin permiso, lo que se
        // enseña en la pantalla Android lo calla solo.
        const plugin = pluginDeLaApk()!;
        if (estado === 'sin-preguntar' && preguntar) {
            const { receive } = await plugin.requestPermissions();
            estado = receive === 'granted' ? 'concedido' : 'denegado';
        }
        const token = await new Promise<string>((resolver, fallar) => {
            const reloj = window.setTimeout(() => fallar(new Error('Firebase no contestó')), 15000);
            void plugin.addListener('registration', (t: { value: string }) => {
                window.clearTimeout(reloj);
                resolver(t.value);
            });
            void plugin.addListener('registrationError', (e: unknown) => {
                window.clearTimeout(reloj);
                fallar(e instanceof Error ? e : new Error('Firebase no dio token'));
            });
            void plugin.register();
        });
        await api.post('/avisos/telefonos', { tipo: 'FCM', destino: token, aparato: navigator.userAgent.slice(0, 120) });
        guardar(token);
        return estado;
    }

    if (estado === 'denegado') return estado;
    if (estado === 'sin-preguntar' && !preguntar) return estado;
    if (estado === 'sin-preguntar') {
        estado = (await Notification.requestPermission()) === 'granted' ? 'concedido' : 'denegado';
        if (estado !== 'concedido') return estado;
    }
    const registro = await navigator.serviceWorker.ready;
    const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveEnBytes(pref.webPush!) as BufferSource }));
    const json = suscripcion.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
    await api.post('/avisos/telefonos', {
        tipo: 'WEB',
        destino: json.endpoint,
        llaves: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        aparato: navigator.userAgent.slice(0, 120),
    });
    guardar(json.endpoint);
    return 'concedido';
}

/**
 * EL TOQUE SILENCIOSO (solo la APK): cuando alguien guarda algo que es de esta
 * persona, el servidor le manda a Firebase un mensaje SIN nada que enseñar
 * (`data.gestiedu = 'datos-cambiaron'`, `avisos.service.ts`) y aquí se pone
 * al día. Llega con la app abierta o en segundo plano; con la app cerrada del
 * todo, Android no tiene dónde correrlo y se pone al día al abrirla.
 */
export const TOQUE_SILENCIOSO = 'datos-cambiaron';

export function alLlegarUnToque(fn: () => void): () => void {
    const plugin = enLaApk() ? pluginDeLaApk() : null;
    if (!plugin) return () => undefined;
    let quitar: (() => void) | null = null;
    let quitado = false;
    void Promise.resolve(
        plugin.addListener('pushNotificationReceived', (n: { data?: Record<string, string> }) => {
            if (n?.data?.gestiedu === TOQUE_SILENCIOSO) fn();
        })
    ).then((h) => {
        if (quitado) h.remove();
        else quitar = () => h.remove();
    });
    return () => {
        quitado = true;
        quitar?.();
    };
}

/**
 * Deja de mandar avisos a este teléfono: al cerrar sesión (antes de borrar la
 * credencial, que el servidor necesita saber de quién es). No falla nunca:
 * cerrar sesión no puede quedarse a medias por esto.
 */
export async function olvidarEsteTelefono(): Promise<void> {
    const destino = guardado();
    try {
        if (destino) await api.delete('/avisos/telefonos', { data: { destino } });
    } catch {
        /* sin conexión: el servidor lo borrará cuando el servicio lo dé por muerto */
    }
    try {
        if (!enLaApk() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            const registro = await navigator.serviceWorker.getRegistration();
            await (await registro?.pushManager.getSubscription())?.unsubscribe();
        }
    } catch {
        /* nada que hacer */
    }
    guardar(null);
}
