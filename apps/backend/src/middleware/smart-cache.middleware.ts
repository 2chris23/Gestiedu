/**
 * SMART CACHE MIDDLEWARE
 *
 * Middleware de cache inteligente que diferencia entre usuarios READ-ONLY y READ-WRITE.
 * Solo cachea requests GET de usuarios READ-ONLY (STUDENT, TUTOR).
 *
 * PROBLEMA RESUELTO: el hook onRequest se ejecuta ANTES que authenticate().
 * SOLUCIÓN: leer el JWT con jwt.decode() (sin verificar) para determinar el rol.
 * La seguridad no se compromete porque:
 *   1. La clave de cache incluye userId → no hay cross-user leaks
 *   2. Si el token es inválido, authenticate() rechazará el request después
 *   3. Un token adulterado solo afectaría el cache del propio usuario
 *
 * Arquitectura:
 * - onRequest hook: DECODE jwt → si GET+READ_ONLY → busca en Redis
 *   - HIT → responde con X-Cache-Status: HIT y termina
 *   - MISS → guarda cacheKey en request para onSend
 * - onSend hook: si cacheKey existe → guarda payload en Redis con TTL
 *
 * Cache key: cache:{instituteSlug}:{route}:{userId}:{sortedQueryParams}
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { RedisCache } from '../config/redis';
import { conLiceo } from '../config/ambito-del-liceo';
import { getCacheTTL } from '../config/cache-ttl';
import { cacheMetrics } from '../utils/cache-metrics';
import { logger } from '../utils/logger';
import { verifyAccessToken } from '../config/jwt';
import { loadUserSession } from './auth.middleware';

// ─── Constantes de roles cacheables ─────────────────────────────────────────

/**
 * Quién aprovecha la copia guardada.
 *
 * Los profesores entraron aquí después, y a propósito: **son los que más
 * consultan y los únicos que no tenían copia**. Medido, la lista de alumnos de
 * una sección les costaba 112 ms cada vez, y bajo carga (30 profesores a la vez)
 * se iba a 5,6 segundos — la acción más cara de todo el sistema.
 *
 * Se puede hacer ahora y no antes porque ya existen las dos piezas que lo hacen
 * seguro:
 *
 *   1. El aviso dirigido (`plugins/avisar-cambios.ts`) limpia la copia del
 *      personal de esa sección en cuanto algo cambia allí.
 *   2. La copia de **quien escribe** se limpia ANTES de responderle, así que
 *      nunca ve su propio cambio desaparecido.
 *
 * Los administradores siguen fuera: ven cosas de todo el liceo, y acotar a quién
 * afecta cada cambio para ellos es mucho más difícil de garantizar.
 */
const READ_ONLY_ROLES = new Set(['STUDENT', 'TUTOR', 'PARENT', 'TEACHER']);

// ─── Símbolo privado para propagar cacheKey a onSend ────────────────────────

export const CACHE_KEY_SYMBOL = Symbol('cacheKey');

declare module 'fastify' {
    interface FastifyRequest {
        [CACHE_KEY_SYMBOL]?: string;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extrae el token JWT del header Authorization sin verificarlo (solo decode).
 * Retorna null si no existe o no es parseable.
 */
/**
 * Quién pide esto — COMPROBADO, no solo leído.
 *
 * ─── LO QUE PASABA ANTES ─────────────────────────────────────────────────────
 *
 * Aquí se usaba `jwt.decode()`, que **lee el token sin comprobar la firma**.
 * Este middleware corre antes que la autenticación y responde por su cuenta
 * cuando encuentra una copia guardada, así que bastaba con inventarse un token:
 *
 *     jwt.sign({ userId: 'V-S000001', role: 'STUDENT' }, 'cualquier-cosa')
 *
 * y el sistema devolvía el panel completo de ese alumno. Sin contraseña y sin
 * conocer la clave del sistema. Se reprodujo: respondió 200 con su nombre, su
 * sección y sus datos.
 *
 * Y como el identificador de cada persona **es su cédula**, no hacía falta
 * adivinar nada raro: con la cédula de alguien se leía lo suyo.
 *
 * ─── LO QUE SE HACE AHORA ────────────────────────────────────────────────────
 *
 * Se comprueba la firma (`verifyAccessToken`) y, además, que la persona siga
 * existiendo y activa, usando la misma sesión que usa la autenticación de
 * verdad. Si desactivan una cuenta, su copia guardada deja de servirle en el
 * acto.
 *
 * Devuelve `null` ante cualquier duda: sin identidad comprobada no se sirve nada
 * desde la copia, y la petición sigue su camino normal hasta la autenticación,
 * que la rechazará como corresponde.
 */
async function quienPide(
    request: FastifyRequest
): Promise<{ userId: string; role: string } | null> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);

    let payload: { userId?: string; id?: string; role?: string };
    try {
        payload = verifyAccessToken(token) as any;
    } catch {
        // Firma inválida, caducado o manipulado: no se sirve nada.
        return null;
    }

    const userId = payload?.userId || payload?.id;
    if (!userId || !payload?.role) return null;

    // La copia guardada no puede saltarse que la cuenta siga activa.
    const db = (request as any).tenantPrisma;
    if (!db) return null;

    try {
        const sesion = await loadUserSession(db, (request as any).institute?.id, userId);
        if (!sesion || !sesion.isActive) return null;
        return { userId, role: sesion.role };
    } catch {
        return null;
    }
}

/**
 * Determina si el request es elegible para cache:
 * - Método GET
 * - Usuario READ_ONLY (STUDENT, TUTOR, PARENT)
 * - No es una ruta excluida
 */
function isCacheable(request: FastifyRequest, role: string): boolean {
    if (request.method !== 'GET') return false;
    if (!READ_ONLY_ROLES.has(role)) return false;
    const url = request.url;
    if (url.includes('/api/superadmin')) return false;
    if (url.includes('/api/auth')) return false;
    if (url.includes('/api/notifications/realtime')) return false;
    return true;
}

/**
 * Genera una cache key única usando el slug del instituto (del header),
 * la ruta, el userId y los query params ordenados.
 */
function generateCacheKey(request: FastifyRequest, userId: string): string {
    // El id lo resuelve el servidor al identificar el liceo; la cabecera la
    // manda el navegador. Antes mandaba la cabecera, y por eso la limpieza de
    // caché (que busca por id) no encontraba nunca nada que borrar: la gente
    // veía datos viejos hasta que caducaban solos.
    const instituteSlug =
        (request as any).institute?.id ||
        (request.headers['x-institute-slug'] as string) ||
        (request.headers['x-subdomain'] as string) ||
        'unknown';

    const urlParts = request.url.split('?');
    const route = urlParts[0];
    const sortedParams = (urlParts[1] || '').split('&').sort().join('&');

    return `cache:${instituteSlug}:${route}:${userId}:${sortedParams}`;
}

// ─── Hook onRequest ───────────────────────────────────────────────────────────

/**
 * Verifica cache en onRequest decodificando el JWT para conocer el rol.
 * Si hay HIT responde directamente. Si hay MISS marca la request para onSend.
 */
/**
 * El liceo de la petición, dicho expresamente.
 *
 * Leer y guardar ocurren en momentos distintos de la petición —uno antes del
 * controlador, otro al enviar la respuesta— y el apartado del liceo no siempre
 * sobrevive a ese salto. Si se guardara en un apartado y se leyera en otro, la
 * copia no se encontraría nunca: no se rompe nada, pero todo el trabajo de
 * guardar pantallas dejaría de servir para algo, en silencio.
 */
function elLiceoDe(request: FastifyRequest): string {
    return (
        (request as unknown as { institute?: { id?: string } }).institute?.id ??
        (request.user as unknown as { instituteId?: string } | undefined)?.instituteId ??
        ''
    );
}

export async function smartCacheMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Sólo procesar GET
    if (request.method !== 'GET') return;

    // Quién pide esto, comprobado de verdad. Sin identidad válida no se sirve
    // nada desde la copia guardada.
    const tokenInfo = await quienPide(request);
    if (!tokenInfo) return;

    // Verificar si el rol es cacheable
    if (!isCacheable(request, tokenInfo.role)) return;

    try {
        const cacheKey = generateCacheKey(request, tokenInfo.userId);
        const cached = await conLiceo(elLiceoDe(request), () => RedisCache.get<unknown>(cacheKey));

        if (cached) {
            cacheMetrics.incrementHits();
            reply.header('X-Cache-Status', 'HIT');
            reply.header('Content-Type', 'application/json');
            logger.debug('Cache HIT', { key: cacheKey, url: request.url });
            // Lo guardado ya es el texto de la respuesta: sale tal cual. Si viene
            // de una copia vieja guardada como datos sueltos, Fastify la arma
            // igual que siempre.
            return reply.send(cached);
        }

        // Marcar para guardar en onSend
        request[CACHE_KEY_SYMBOL] = cacheKey;
        cacheMetrics.incrementMisses();
        reply.header('X-Cache-Status', 'MISS');
        logger.debug('Cache MISS', { key: cacheKey, url: request.url });
    } catch (error) {
        logger.error('Error en smart cache middleware (onRequest)', {
            error: error instanceof Error ? error.message : 'Unknown',
            url: request.url,
        });
        // Falla silenciosa: continuar sin cache
    }
}

// ─── Hook onSend ──────────────────────────────────────────────────────────────

/**
 * Guarda el payload en Redis si la request fue marcada para cachear.
 * Solo guarda responses 2xx.
 */
export async function cacheOnSendHook(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown
): Promise<unknown> {
    const cacheKey = request[CACHE_KEY_SYMBOL];
    if (!cacheKey) return payload;

    try {
        if (reply.statusCode >= 200 && reply.statusCode < 300 && payload) {
            /**
             * SE GUARDA EL TEXTO TAL CUAL SALE, SIN DESHACERLO Y VOLVERLO A HACER.
             *
             * Aquí llega la respuesta ya convertida a texto, lista para enviar.
             * Antes se deshacía ese texto para guardarlo como datos sueltos y, al
             * servirlo de la copia, se volvía a armar el mismo texto. Dos trabajos
             * enteros para acabar exactamente en el mismo sitio.
             *
             * Medido con el grabador de perfil bajo la prueba de un día completo:
             * deshacerlo era el 5,87% del procesador del servidor, y volverlo a
             * armar, parte del 13,9% que se iba en armar respuestas.
             *
             * Lo que no venga como texto (un archivo, por ejemplo) no se guarda:
             * la copia es para pantallas, no para descargas.
             */
            if (typeof payload !== 'string') return payload;

            const ttl = getCacheTTL(request.url);
            await conLiceo(elLiceoDe(request), () => RedisCache.set(cacheKey, payload, ttl));
            logger.debug('Cache guardado', { key: cacheKey, ttl, url: request.url });
        }
    } catch (error) {
        logger.error('Error guardando en cache (onSend)', {
            error: error instanceof Error ? error.message : 'Unknown',
            key: cacheKey,
        });
    }

    return payload;
}
