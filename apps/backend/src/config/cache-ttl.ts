/**
 * CONFIGURACIÓN DE TTL PARA CACHE
 * 
 * Define los TTLs (Time To Live) para diferentes tipos de datos.
 * Los TTLs están optimizados según la frecuencia de actualización de cada tipo de dato.
 */

/**
 * TTLs en segundos
 */
const TTL_CONFIG: Record<string, number> = {
    // Datos altamente cacheables (30 minutos)
    '/api/users/me': 1800,
    '/api/students/me': 1800,
    '/api/subjects': 1800,
    '/api/schedules': 1800,
    '/api/classrooms': 1800,
    '/api/teachers': 1800,
    '/api/academic-years': 1800,

    // Datos medianamente cacheables (5 minutos)
    '/api/dashboard': 300,
    '/api/grades': 300,
    '/api/activities': 300,
    '/api/students': 300,

    // Datos poco cacheables (2 minutos)
    '/api/attendance': 120,

    // Datos en tiempo casi real (30 segundos)
    '/api/notifications': 30,

    // Default para rutas no especificadas
    'default': 300, // 5 minutos
};

/**
 * Obtiene el TTL apropiado para una ruta
 */
export function getCacheTTL(route: string): number {
    // Normalizar ruta (remover query params)
    const normalizedRoute = route.split('?')[0];

    // Buscar coincidencia exacta o por prefijo
    for (const [pattern, ttl] of Object.entries(TTL_CONFIG)) {
        if (pattern === 'default') continue;

        if (normalizedRoute === pattern || normalizedRoute.startsWith(pattern)) {
            return ttl;
        }
    }

    // Retornar TTL por defecto
    return TTL_CONFIG.default;
}

/**
 * Obtiene el TTL en formato legible
 */
export function getCacheTTLReadable(route: string): string {
    const ttl = getCacheTTL(route);

    if (ttl >= 3600) {
        return `${Math.floor(ttl / 3600)}h`;
    } else if (ttl >= 60) {
        return `${Math.floor(ttl / 60)}m`;
    } else {
        return `${ttl}s`;
    }
}

/**
 * Configuración de TTL exportada para referencia
 */
export const CACHE_TTL = TTL_CONFIG;
