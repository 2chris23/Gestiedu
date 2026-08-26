/**
 * CACHE INVALIDATION UTILITIES
 * 
 * Funciones para invalidar cache de forma selectiva cuando los datos cambian.
 * Usa patrones de Redis para invalidar múltiples keys relacionadas.
 */

import { RedisCache } from '../config/redis';
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
        await RedisCache.clearPattern(pattern);
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
export async function invalidateStudentGradesCache(
    instituteId: string,
    studentId: string
): Promise<void> {
    try {
        const patterns = [
            `cache:${instituteId}:/api/grades:${studentId}:*`,
            `cache:${instituteId}:/api/dashboard:${studentId}:*`,
            `cache:${instituteId}:/api/students/me:${studentId}:*`,
        ];

        for (const pattern of patterns) {
            await RedisCache.clearPattern(pattern);
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
 * Invalida cache de asistencias de un aula
 */
export async function invalidateClassroomAttendanceCache(
    instituteId: string,
    classroomId: string
): Promise<void> {
    try {
        // Invalidar para todos los estudiantes del aula
        const pattern = `cache:${instituteId}:/api/attendance:*:*classroomId=${classroomId}*`;
        await RedisCache.clearPattern(pattern);

        cacheMetrics.incrementInvalidations();

        logger.debug('Cache de asistencias invalidado', {
            instituteId,
            classroomId,
        });
    } catch (error) {
        logger.error('Error invalidando cache de asistencias', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
            classroomId,
        });
    }
}

/**
 * Invalida cache de actividades de una materia
 */
export async function invalidateSubjectActivitiesCache(
    instituteId: string,
    subjectId: string
): Promise<void> {
    try {
        const pattern = `cache:${instituteId}:/api/activities:*:*subjectId=${subjectId}*`;
        await RedisCache.clearPattern(pattern);

        cacheMetrics.incrementInvalidations();

        logger.debug('Cache de actividades invalidado', {
            instituteId,
            subjectId,
        });
    } catch (error) {
        logger.error('Error invalidando cache de actividades', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
            subjectId,
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
        await RedisCache.clearPattern(pattern);

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

/**
 * Invalida cache de horarios
 */
export async function invalidateSchedulesCache(
    instituteId: string
): Promise<void> {
    try {
        const pattern = `cache:${instituteId}:/api/schedules:*`;
        await RedisCache.clearPattern(pattern);

        cacheMetrics.incrementInvalidations();

        logger.debug('Cache de horarios invalidado', {
            instituteId,
        });
    } catch (error) {
        logger.error('Error invalidando cache de horarios', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
        });
    }
}

/**
 * Invalida cache de un instituto completo (usar con precaución)
 */
export async function invalidateInstituteCache(
    instituteId: string
): Promise<void> {
    try {
        const pattern = `cache:${instituteId}:*`;
        await RedisCache.clearPattern(pattern);

        cacheMetrics.incrementInvalidations();

        logger.warn('Cache completo del instituto invalidado', {
            instituteId,
        });
    } catch (error) {
        logger.error('Error invalidando cache del instituto', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
        });
    }
}

/**
 * Invalida cache por ruta específica
 */
export async function invalidateCacheByRoute(
    instituteId: string,
    route: string
): Promise<void> {
    try {
        const pattern = `cache:${instituteId}:${route}:*`;
        await RedisCache.clearPattern(pattern);

        cacheMetrics.incrementInvalidations();

        logger.debug('Cache invalidado por ruta', {
            instituteId,
            route,
        });
    } catch (error) {
        logger.error('Error invalidando cache por ruta', {
            error: error instanceof Error ? error.message : 'Unknown',
            instituteId,
            route,
        });
    }
}
