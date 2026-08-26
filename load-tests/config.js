/**
 * CONFIGURACIÓN COMPARTIDA PARA TESTS K6
 *
 * Importar en cada test:
 *   import { config, loginUser, authHeaders, trackCache } from './config.js';
 */

import http from 'k6/http';
import { check } from 'k6';

export const config = {
    apiUrl: __ENV.API_URL || 'http://localhost:3001',
    instituteSlug: __ENV.INSTITUTE_SLUG || 'test-load-5k',
    csvPath: __ENV.CSV_PATH || './test-users-5k.csv',
};

const BASE_URL = config.apiUrl;

/**
 * Login y devuelve el token JWT (o null si falla)
 */
export function loginUser(email, password, slug) {
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ email, password }),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Institute-Slug': slug,
                'X-Subdomain': slug,
            },
            timeout: '10s',
        }
    );

    if (res.status !== 200 && res.status !== 201) return null;

    try {
        const body = JSON.parse(res.body);
        // La respuesta tiene estructura: { user: {...}, tokens: { accessToken, refreshToken } }
        return body?.tokens?.accessToken || body?.accessToken || body?.token || body?.data?.token || null;
    } catch {
        return null;
    }
}

/**
 * Headers estándar para requests autenticados
 */
export function authHeaders(token, slug) {
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Institute-Slug': slug,
        'X-Subdomain': slug,
    };
}

/**
 * Lee el header X-Cache-Status y devuelve 'HIT' | 'MISS' | 'SKIP'
 */
export function trackCache(response) {
    const status = response.headers['X-Cache-Status'] ||
        response.headers['x-cache-status'] ||
        response.headers['X-Cache'] || '';

    if (status.toUpperCase().includes('HIT')) return 'HIT';
    if (status.toUpperCase().includes('MISS')) return 'MISS';
    return 'SKIP';
}

/**
 * Verifica que un request tuvo éxito y registra cache
 */
export function checkAndTrack(response, name, cacheHits, cacheMisses, cacheHitRate) {
    const ok = check(response, {
        [`${name}: status < 500`]: r => r.status < 500,
        [`${name}: status !== 0`]: r => r.status !== 0,
    });

    const cacheStatus = trackCache(response);
    if (cacheStatus === 'HIT') {
        cacheHits.add(1);
        if (cacheHitRate) cacheHitRate.add(true);
    } else if (cacheStatus === 'MISS') {
        cacheMisses.add(1);
        if (cacheHitRate) cacheHitRate.add(false);
    }

    return ok;
}
