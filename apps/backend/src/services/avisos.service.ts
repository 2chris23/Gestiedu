import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import webpush from 'web-push';
import { createError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

/**
 * LOS AVISOS: EN LA APP Y EN EL TELÉFONO, COMO WHATSAPP
 *
 * Un solo punto de entrada, `avisar()`, para todo lo que tenga que llegarle a
 * alguien (una citación, y lo que venga):
 *
 *   1. Lo GUARDA (tabla `notifications`): sale en la campana de la app.
 *   2. Lo ANUNCIA por el tiempo real: con la app abierta, llega al instante.
 *   3. Lo MANDA AL TELÉFONO, con la app cerrada:
 *        - **Web Push** para la app instalada desde el navegador (y el
 *          navegador): llaves VAPID propias del servidor (`VAPID_*`).
 *        - **Firebase (FCM)** para la APK: el WebView de la APK no recibe Web
 *          Push. Necesita la cuenta de servicio del proyecto de Firebase
 *          (`FCM_CUENTA_DE_SERVICIO`, el JSON o su ruta). Sin ella, la APK
 *          tiene la campana y el tiempo real, y nada más.
 *
 * **Lo que dice el aviso en la pantalla bloqueada: qué y cuándo, sin
 * detalles** (`alTelefono`). El motivo y lo hablado se leen al abrir la app,
 * con sesión: un teléfono sobre una mesa no cuenta lo que pasó con el alumno.
 *
 * Una suscripción que el servicio da por muerta (404/410, o `UNREGISTERED` en
 * Firebase) se borra sola. Al cerrar sesión en un teléfono se borra la suya:
 * un teléfono prestado no recibe los avisos del anterior. Cada persona puede
 * apagar los avisos al teléfono (`preferences.avisosAlTelefono = false`); la
 * campana sigue.
 *
 * El envío al teléfono no hace esperar a quien guarda: va por detrás
 * (`esperarEnvios()` es para las pruebas). Pruebas: `avisos.test.ts` (NOTI-*).
 */

export interface Aviso {
    /** A quién (ids de usuario). */
    a: string[];
    titulo: string;
    mensaje: string;
    /** Adónde lleva al tocarlo (ruta de la app, p. ej. «/dashboard/citaciones/…»). */
    enlace?: string | null;
    /** Clase de aviso («CITACION»…), para la campana. */
    tipo?: string;
    /** Lo que sale con la app cerrada. Por defecto, solo el título. */
    alTelefono?: { titulo: string; cuerpo: string };
}

type Emisor = { to: (sala: string) => { emit: (evento: string, datos: unknown) => void } } | null | undefined;

const pendientes = new Set<Promise<unknown>>();

/** Espera a que salgan los envíos al teléfono en curso (para las pruebas). */
export async function esperarEnvios(): Promise<void> {
    while (pendientes.size) await Promise.allSettled([...pendientes]);
}

export async function avisar(prisma: any, instituteId: string, io: Emisor, aviso: Aviso): Promise<number> {
    const destinatarios = [...new Set(aviso.a.filter(Boolean))];
    if (destinatarios.length === 0) return 0;
    const ahora = new Date();
    await prisma.notification.createMany({
        data: destinatarios.map((recipientId) => ({
            title: aviso.titulo,
            message: aviso.mensaje,
            type: aviso.tipo ?? 'INFO',
            priority: 'NORMAL',
            recipientId,
            actionUrl: aviso.enlace ?? null,
            instituteId,
            createdAt: ahora,
        })),
    });
    for (const id of destinatarios) {
        io?.to(`user:${instituteId}:${id}`).emit('aviso:nuevo', { titulo: aviso.titulo, enlace: aviso.enlace ?? null });
    }
    const envio = alTelefono(prisma, destinatarios, {
        titulo: aviso.alTelefono?.titulo ?? aviso.titulo,
        cuerpo: aviso.alTelefono?.cuerpo ?? 'Ábrelo en la app para verlo.',
        enlace: aviso.enlace ?? '/dashboard',
    }).catch((e) => logger.warn('No salió un aviso al teléfono', { error: e instanceof Error ? e.message : String(e) }));
    pendientes.add(envio);
    void envio.finally(() => pendientes.delete(envio));
    return destinatarios.length;
}

// ─── Al teléfono ─────────────────────────────────────────────────────────────

interface Carga {
    titulo: string;
    cuerpo: string;
    enlace: string;
}

/** ¿Tiene el servidor las llaves de Web Push? */
export function clavePublicaWebPush(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
}

let vapidPuesto = false;
function prepararWebPush(): boolean {
    const publica = process.env.VAPID_PUBLIC_KEY;
    const privada = process.env.VAPID_PRIVATE_KEY;
    if (!publica || !privada) return false;
    if (!vapidPuesto) {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@gestiedu.app', publica, privada);
        vapidPuesto = true;
    }
    return true;
}

async function alTelefono(prisma: any, userIds: string[], carga: Carga) {
    const personas = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, preferences: true } });
    const quierenAvisos = personas
        .filter((p: any) => (p.preferences as Record<string, unknown> | null)?.avisosAlTelefono !== false)
        .map((p: any) => p.id);
    if (quierenAvisos.length === 0) return;
    const suscripciones = await prisma.suscripcionDeAviso.findMany({ where: { userId: { in: quierenAvisos } } });
    const muertas: string[] = [];
    await Promise.all(
        suscripciones.map(async (s: any) => {
            const viva = s.tipo === 'FCM' ? await porFirebase(s.destino, carga) : await porWebPush(s, carga);
            if (!viva) muertas.push(s.id);
        })
    );
    if (muertas.length) await prisma.suscripcionDeAviso.deleteMany({ where: { id: { in: muertas } } });
}

/** Devuelve false si la suscripción ya no existe (hay que borrarla). */
async function porWebPush(s: { destino: string; llaves: any }, carga: Carga): Promise<boolean> {
    if (!prepararWebPush()) return true;
    try {
        await webpush.sendNotification({ endpoint: s.destino, keys: s.llaves }, JSON.stringify(carga), { TTL: 24 * 3600, urgency: 'high' });
        return true;
    } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) return false;
        logger.warn('Web Push no salió', { status: e?.statusCode });
        return true;
    }
}

// ─── Firebase (la APK) ───────────────────────────────────────────────────────

interface CuentaDeServicio {
    project_id: string;
    client_email: string;
    private_key: string;
    token_uri?: string;
}

function cuentaDeFirebase(): CuentaDeServicio | null {
    const v = process.env.FCM_CUENTA_DE_SERVICIO;
    if (!v) return null;
    try {
        return JSON.parse(v.trim().startsWith('{') ? v : readFileSync(v, 'utf-8'));
    } catch {
        logger.warn('FCM_CUENTA_DE_SERVICIO no se pudo leer');
        return null;
    }
}

/** ¿Puede el servidor mandar avisos a la APK? */
export const hayFirebase = () => cuentaDeFirebase() !== null;

let llaveDeGoogle: { token: string; caduca: number } | null = null;

/** El permiso de 1 h para hablar con Firebase: un JWT firmado con la cuenta de servicio. */
async function permisoDeFirebase(cuenta: CuentaDeServicio): Promise<string> {
    if (llaveDeGoogle && llaveDeGoogle.caduca > Date.now() + 60_000) return llaveDeGoogle.token;
    const ahora = Math.floor(Date.now() / 1000);
    const url = process.env.FCM_TOKEN_URL || cuenta.token_uri || 'https://oauth2.googleapis.com/token';
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const cabeza = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
        iss: cuenta.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: url,
        iat: ahora,
        exp: ahora + 3600,
    })}`;
    const firma = createSign('RSA-SHA256').update(cabeza).sign(cuenta.private_key).toString('base64url');
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabeza}.${firma}` }),
    });
    if (!r.ok) throw new Error(`Google no dio permiso para Firebase (${r.status})`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    llaveDeGoogle = { token: j.access_token, caduca: Date.now() + j.expires_in * 1000 };
    return j.access_token;
}

async function porFirebase(token: string, carga: Carga): Promise<boolean> {
    const cuenta = cuentaDeFirebase();
    if (!cuenta) return true;
    const base = process.env.FCM_URL || 'https://fcm.googleapis.com';
    const r = await fetch(`${base}/v1/projects/${cuenta.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await permisoDeFirebase(cuenta)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: {
                token,
                notification: { title: carga.titulo, body: carga.cuerpo },
                data: { enlace: carga.enlace },
                android: { priority: 'high', notification: { click_action: 'FCM_PLUGIN_ACTIVITY' } },
            },
        }),
    });
    if (r.ok) return true;
    const texto = await r.text().catch(() => '');
    if (r.status === 404 || texto.includes('UNREGISTERED')) return false;
    logger.warn('Firebase no mandó el aviso', { status: r.status });
    return true;
}

// ─── Lo que pide la app ──────────────────────────────────────────────────────

/** La campana: los últimos avisos de la persona y cuántos no ha leído. */
export async function misAvisos(prisma: any, userId: string) {
    const [avisos, sinLeer] = await Promise.all([
        prisma.notification.findMany({
            where: { recipientId: userId },
            orderBy: { createdAt: 'desc' },
            take: 30,
            select: { id: true, title: true, message: true, type: true, actionUrl: true, readAt: true, createdAt: true },
        }),
        prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
    ]);
    return {
        avisos: avisos.map((a: any) => ({
            id: a.id,
            titulo: a.title,
            mensaje: a.message,
            tipo: a.type,
            enlace: a.actionUrl,
            leido: !!a.readAt,
            creadoEl: a.createdAt,
        })),
        sinLeer,
    };
}

/** Marca uno (o todos, sin id) como leído. Solo los suyos: el de otro no existe para él. */
export async function marcarLeido(prisma: any, userId: string, id?: string) {
    const r = await prisma.notification.updateMany({
        where: { recipientId: userId, readAt: null, ...(id ? { id } : {}) },
        data: { readAt: new Date() },
    });
    if (id && r.count === 0 && !(await prisma.notification.count({ where: { id, recipientId: userId } }))) {
        throw createError(404, 'Ese aviso no existe', 'AVISO_NO_EXISTE');
    }
    return misAvisos(prisma, userId);
}

/** Una dirección de Web Push es siempre https (la da el navegador: Google, Mozilla, Apple). */
const esDestinoWeb = (v: string) => /^https:\/\/[^\s]{10,2000}$/.test(v);

/** Apunta este teléfono para recibir avisos de esta persona. Si era de otra, pasa a ser de esta. */
export async function suscribir(
    prisma: any,
    userId: string,
    datos: { tipo: string; destino: string; llaves?: { p256dh?: string; auth?: string } | null; aparato?: string | null }
) {
    const tipo = datos.tipo === 'FCM' ? 'FCM' : datos.tipo === 'WEB' ? 'WEB' : null;
    if (!tipo) throw createError(400, 'El tipo es WEB o FCM', 'SUSCRIPCION_INVALIDA');
    if (tipo === 'WEB' && (!esDestinoWeb(datos.destino) || !datos.llaves?.p256dh || !datos.llaves?.auth)) {
        throw createError(400, 'Suscripción de Web Push incompleta', 'SUSCRIPCION_INVALIDA');
    }
    if (tipo === 'FCM' && !/^[\w:-]{20,4096}$/.test(datos.destino)) throw createError(400, 'Token de Firebase no válido', 'SUSCRIPCION_INVALIDA');
    const llaves = tipo === 'WEB' ? { p256dh: datos.llaves!.p256dh, auth: datos.llaves!.auth } : null;
    const aparato = datos.aparato ? String(datos.aparato).slice(0, 120) : null;
    await prisma.suscripcionDeAviso.upsert({
        where: { destino: datos.destino },
        create: { userId, tipo, destino: datos.destino, llaves, aparato },
        update: { userId, tipo, llaves, aparato, ultimaVez: new Date() },
    });
    return { suscrito: true };
}

/** Deja de mandar avisos a este teléfono (al cerrar sesión o al apagarlos). Solo la suya. */
export async function desuscribir(prisma: any, userId: string, destino: string) {
    const r = await prisma.suscripcionDeAviso.deleteMany({ where: { destino, userId } });
    return { quitadas: r.count };
}

export async function preferenciasDeAvisos(prisma: any, userId: string) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    const p = (u?.preferences ?? {}) as Record<string, unknown>;
    return {
        alTelefono: p.avisosAlTelefono !== false,
        webPush: clavePublicaWebPush(),
        firebase: hayFirebase(),
    };
}

export async function ponerPreferenciasDeAvisos(prisma: any, userId: string, alTelefono: boolean) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    const p = { ...((u?.preferences ?? {}) as Record<string, unknown>), avisosAlTelefono: alTelefono };
    await prisma.user.update({ where: { id: userId }, data: { preferences: p } });
    return preferenciasDeAvisos(prisma, userId);
}
