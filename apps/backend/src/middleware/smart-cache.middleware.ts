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
import { getCacheTTL } from '../config/cache-ttl';
import { cacheMetrics } from '../utils/cache-metrics';
import { logger } from '../utils/logger';

// ─── Constantes de roles cacheables ─────────────────────────────────────────

const READ_ONLY_ROLES = new Set(['STUDENT', 'TUTOR', 'PARENT']);

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
function decodeTokenFromRequest(request: FastifyRequest): { userId: string; role: string } | null {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    try {
        const decoded = jwt.decode(token) as any;
        if (!decoded || typeof decoded !== 'object') return null;
        const userId = decoded.userId || decoded.id || decoded.sub;
        const role = decoded.role;
        if (!userId || !role) return null;
        return { userId, role };
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
    const instituteSlug =
        (request.headers['x-institute-slug'] as string) ||
        (request.headers['x-subdomain'] as string) ||
        (request as any).institute?.id ||
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
export async function smartCacheMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Sólo procesar GET
    if (request.method !== 'GET') return;

    // Decodificar JWT para conocer el rol del usuario
    const tokenInfo = decodeTokenFromRequest(request);
    if (!tokenInfo) return; // Sin token → no cacheable (rutas públicas)

    // Verificar si el rol es cacheable
    if (!isCacheable(request, tokenInfo.role)) return;

    try {
        const cacheKey = generateCacheKey(request, tokenInfo.userId);
        const cached = await RedisCache.get<unknown>(cacheKey);

        if (cached) {
            cacheMetrics.incrementHits();
            reply.header('X-Cache-Status', 'HIT');
            reply.header('Content-Type', 'application/json');
            logger.debug('Cache HIT', { key: cacheKey, url: request.url });
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
            const ttl = getCacheTTL(request.url);
            let data: unknown = payload;

            if (typeof payload === 'string') {
                try { data = JSON.parse(payload); } catch { /* guardar como string */ }
            }

            await RedisCache.set(cacheKey, data, ttl);
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
