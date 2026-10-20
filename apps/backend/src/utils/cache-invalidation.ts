/**
 * CACHE INVALIDATION UTILITIES
 *
 * Funciones para invalidar cache de forma selectiva cuando los datos cambian.
 * Usa patrones de Redis para invalidar múltiples keys relacionadas.
 *
 * EL LICEO VA DICHO, NO SUPUESTO. Cada cosa guardada vive dentro del apartado de
 * su liceo (`config/ambito-del-liceo.ts`). Todas estas funciones **reciben** el
 * liceo, así que lo dicen expresamente con `conLiceo(...)` en vez de confiar en
 * el de la petición: así valen igual llamadas desde un gancho tardío, una tarea
 * o un guion, donde no hay petición de la que heredarlo.
 */

import { RedisCache } from '../config/redis';
import { conLiceo } from '../config/ambito-del-liceo';
import { cacheMetrics } from './cache-metrics';
import { logger } from './logger';

/**
 * Invalida todo el cache de un usuario específico
 */
export async function invalidateUserCache(
    instituteId: string,
    userId: string
): Promise<void> {
    try {
        const pattern = `cache:${instituteId}:*:${userId}:*`;
        await conLiceo(instituteId, () => RedisCache.clearPattern(pattern));
        cacheMetrics.incrementInvalidations();

        logger.debug('Cache invalidado para usuario', {
            instituteId,
            userId,
            pattern,
        });
    } catch (error) {
        logger.error('Error invalidando cache de usuario', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
            userId,
        });
    }
}

/**
 * Invalida cache de notas de un estudiante
 */
/**
 * LO MISMO, PERO PARA UNA TANDA ENTERA
 *
 * `invalidateStudentGradesCache` hace **tres recorridos completos** de las
 * claves guardadas por cada alumno. Llamándola en bucle para las 29 notas de
 * una sección salían **87 recorridos** por un solo "guardar" del profesor.
 *
 * Es el mismo fallo que ya se corrigió en el aviso de cambios —borrar de uno en
 * uno lo que se puede borrar de una pasada— y que aquí se había quedado.
 *
 * Con una sola llamada se recorre una vez para todos.
 */
export async function invalidateStudentsGradesCache(
    instituteId: string,
    studentIds: string[]
): Promise<void> {
    const unicos = Array.from(new Set(studentIds.filter(Boolean)));
    if (unicos.length === 0) return;

    try {
        const patterns = unicos.flatMap((studentId) => [
            `cache:${instituteId}:/api/dashboard:${studentId}:*`,
            `cache:${instituteId}:/api/students/me:${studentId}:*`,
        ]);

        await conLiceo(instituteId, () => RedisCache.clearPatterns(patterns));
        cacheMetrics.incrementInvalidations();

        logger.debug('Cache de notas invalidado en tanda', {
            instituteId,
            alumnos: unicos.length,
        });
    } catch (error) {
        logger.error('Error invalidando cache de notas en tanda', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
            alumnos: unicos.length,
        });
    }
}

export async function invalidateStudentGradesCache(
    instituteId: string,
    studentId: string
): Promise<void> {
    try {
        const patterns = [
            `cache:${instituteId}:/api/dashboard:${studentId}:*`,
            `cache:${instituteId}:/api/students/me:${studentId}:*`,
        ];

        for (const pattern of patterns) {
            await conLiceo(instituteId, () => RedisCache.clearPattern(pattern));
        }

        cacheMetrics.incrementInvalidations();

        logger.debug('Cache de notas invalidado', {
            instituteId,
            studentId,
        });
    } catch (error) {
        logger.error('Error invalidando cache de notas', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
            studentId,
        });
    }
}



/**
 * Invalida cache de dashboard de todos los usuarios
 */
export async function invalidateDashboardCache(
    instituteId: string
): Promise<void> {
    try {
        const pattern = `cache:${instituteId}:/api/dashboard:*`;
        await conLiceo(instituteId, () => RedisCache.clearPattern(pattern));

        cacheMetrics.incrementInvalidations();

        logger.debug('Cache de dashboard invalidado', {
            instituteId,
        });
    } catch (error) {
        logger.error('Error invalidando cache de dashboard', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
        });
    }
}



