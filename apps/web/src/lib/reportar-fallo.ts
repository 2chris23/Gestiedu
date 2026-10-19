import { API_URL } from '@/config/env';

/**
 * LOS FALLOS DE LA PANTALLA LLEGAN AL SUPERADMIN (salud, 18-oct-2026)
 *
 * Un error de la pantalla (un botón que revienta, una página que no abre)
 * no lo ve nadie: pasa en el teléfono de un alumno. Aquí se escucha
 * `window.onerror` y las promesas rechazadas sin `catch`, y se manda un resumen
 * a `POST /api/errores`, donde se agrupa por huella con los del servidor
 * (`utils/errores-agrupados.ts`). Sin datos personales: el servidor tapa
 * cédulas, correos e ids.
 *
 * Con freno: como mucho 10 por pantalla abierta y nunca el mismo dos veces;
 * sin conexión no se manda (y no se guarda: es una medición, no un dato).
 * Las huellas que devuelve el servidor se recuerdan para «Reportar un
 * problema» (las adjunta solas).
 */

const API_BASE_URL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
const MAXIMO = 10;
const RUIDO = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection captured|AbortError|The user aborted/i;

let mandados = 0;
const vistos = new Set<string>();
const huellas: string[] = [];

export function lasUltimasHuellas(): string[] {
    return huellas.slice(-10);
}

function elSlug(): string | null {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(/(?:^|;\s*)institute_slug=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : null;
}

function laVersion(): string | null {
    try {
        return (window as any).__versionDeLaApp ?? process.env.NEXT_PUBLIC_VERSION ?? null;
    } catch {
        return null;
    }
}

export function mandarFallo(error: unknown, tipoPorDefecto = 'Error'): void {
    if (typeof window === 'undefined') return;
    try {
        const e = error as { name?: string; message?: string; stack?: string } | null;
        const mensaje = String(e?.message ?? error ?? '').slice(0, 1000);
        if (!mensaje || RUIDO.test(mensaje)) return;
        const clave = `${e?.name}|${mensaje}`;
        if (vistos.has(clave) || mandados >= MAXIMO) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        vistos.add(clave);
        mandados++;
        const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
        const slug = elSlug();
        if (slug) cabeceras['X-Institute-Slug'] = slug;
        void fetch(`${API_BASE_URL}/errores`, {
            method: 'POST',
            headers: cabeceras,
            keepalive: true,
            credentials: 'include',
            body: JSON.stringify({
                tipo: (e?.name || tipoPorDefecto).slice(0, 80),
                mensaje,
                pila: (e?.stack ?? '').slice(0, 8000),
                pantalla: window.location.pathname.slice(0, 300),
                version: laVersion(),
            }),
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (d?.huella) huellas.push(String(d.huella));
            })
            .catch(() => undefined);
    } catch {
        /* reportar un fallo nunca puede ser otro fallo */
    }
}

let escuchando = false;
export function escucharLosFallos(): void {
    if (escuchando || typeof window === 'undefined') return;
    escuchando = true;
    window.addEventListener('error', (ev) => mandarFallo(ev.error ?? ev.message));
    window.addEventListener('unhandledrejection', (ev) => mandarFallo(ev.reason, 'PromesaSinCatch'));
}
