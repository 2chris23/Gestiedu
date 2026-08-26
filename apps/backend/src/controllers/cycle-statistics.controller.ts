import { FastifyRequest, FastifyReply } from 'fastify';
import { cycleStatisticsService } from '../services/cycle-statistics.service';
import { logger } from '../utils/logger';
import { RequestUser } from '../types/fastify';

/**
 * CONTROLADOR DE ESTADÍSTICAS JERÁRQUICAS
 * 
 * Endpoints para consultar las estadísticas en los 4 niveles:
 * - Materia específica
 * - Sección global
 * - Grado completo
 * - Ciclo escolar
 */

interface SubjectAverageParams {
    sectionId: string;
    subjectId: string;
}

interface SectionAverageParams {
    sectionId: string;
}

interface GradeAverageParams {
    academicYearId: string;
    gradeLevel: string;
}

interface CycleAverageParams {
    academicYearId: string;
}

/**
 * GET /api/statistics/subject/:sectionId/:subjectId
 * Obtener promedio de una materia específica en una sección
 */
export async function getSubjectAverage(
    request: FastifyRequest<{ Params: SubjectAverageParams }>,
    reply: FastifyReply
) {
    try {
        const { sectionId, subjectId } = request.params;

        const result = await cycleStatisticsService.getSubjectAverage(
            request.tenantPrisma,
            sectionId,
            subjectId
        );

        logger.info('Subject average retrieved', {
            userId: (request.user as RequestUser)?.userId,
            sectionId,
            subjectId,
            average: result.average,
        });

        return reply.status(200).send({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error('Error getting subject average', {
            error: error instanceof Error ? error.message : 'Unknown error',
            params: request.params,
        });

        return reply.status(500).send({
            success: false,
            error: 'Error al obtener promedio de materia',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * GET /api/statistics/section/:sectionId
 * Obtener promedio global de una sección (todas las materias)
 */
export async function getSectionGlobalAverage(
    request: FastifyRequest<{ Params: SectionAverageParams }>,
    reply: FastifyReply
) {
    try {
        const { sectionId } = request.params;

        const result = await cycleStatisticsService.getSectionGlobalAverage(
            request.tenantPrisma,
            sectionId
        );

        logger.info('Section global average retrieved', {
            userId: (request.user as RequestUser)?.userId,
            sectionId,
            average: result.globalAverage,
        });

        return reply.status(200).send({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error('Error getting section global average', {
            error: error instanceof Error ? error.message : 'Unknown error',
            params: request.params,
        });

        return reply.status(500).send({
            success: false,
            error: 'Error al obtener promedio global de sección',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * GET /api/statistics/grade/:academicYearId/:gradeLevel
 * Obtener promedio de un grado completo (todas las secciones del grado)
 */
export async function getGradeAverage(
    request: FastifyRequest<{ Params: GradeAverageParams }>,
    reply: FastifyReply
) {
    try {
        const { academicYearId, gradeLevel } = request.params;
        const gradeLevelNum = parseInt(gradeLevel, 10);

        // Validar que gradeLevel sea un número del 1 al 5
        if (isNaN(gradeLevelNum) || gradeLevelNum < 1 || gradeLevelNum > 5) {
            return reply.status(400).send({
                success: false,
                error: 'El nivel de grado debe ser un número entre 1 y 5',
                code: 'INVALID_GRADE_LEVEL',
            });
        }

        const result = await cycleStatisticsService.getGradeAverage(
            request.tenantPrisma,
            academicYearId,
            gradeLevelNum
        );

        logger.info('Grade average retrieved', {
            userId: (request.user as RequestUser)?.userId,
            academicYearId,
            gradeLevel: gradeLevelNum,
            average: result.average,
        });

        return reply.status(200).send({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error('Error getting grade average', {
            error: error instanceof Error ? error.message : 'Unknown error',
            params: request.params,
        });

        return reply.status(500).send({
            success: false,
            error: 'Error al obtener promedio de grado',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * GET /api/statistics/cycle/:academicYearId
 * Obtener promedio global del ciclo escolar completo (todos los grados)
 */
export async function getCycleGlobalAverage(
    request: FastifyRequest<{ Params: CycleAverageParams }>,
    reply: FastifyReply
) {
    try {
        const { academicYearId } = request.params;

        const result = await cycleStatisticsService.getCycleGlobalAverage(
            request.tenantPrisma,
            academicYearId
        );

        logger.info('Cycle global average retrieved', {
            userId: (request.user as RequestUser)?.userId,
            academicYearId,
            average: result.globalAverage,
        });

        return reply.status(200).send({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error('Error getting cycle global average', {
            error: error instanceof Error ? error.message : 'Unknown error',
            params: request.params,
        });

        // Si el año académico no existe
        if (error instanceof Error && error.message.includes('not found')) {
            return reply.status(404).send({
                success: false,
                error: 'Año académico no encontrado',
                code: 'ACADEMIC_YEAR_NOT_FOUND',
            });
        }

        return reply.status(500).send({
            success: false,
            error: 'Error al obtener promedio global del ciclo',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * POST /api/statistics/cache/clear/section/:sectionId
 * Limpiar cache de estadísticas de una sección (Admin only)
 */
export async function clearSectionCache(
    request: FastifyRequest<{ Params: SectionAverageParams }>,
    reply: FastifyReply
) {
    try {
        const { sectionId } = request.params;

        // Solo administradores pueden limpiar cache
        const user = request.user as RequestUser;
        if (user?.role !== 'ADMIN') {
            return reply.status(403).send({
                success: false,
                error: 'No tienes permisos para limpiar el cache',
                code: 'INSUFFICIENT_PERMISSIONS',
            });
        }

        await cycleStatisticsService.clearSectionCache(request.tenantPrisma, sectionId);

        logger.info('Section cache cleared', {
            userId: user.userId,
            sectionId,
        });

        return reply.status(200).send({
            success: true,
            message: 'Cache de sección limpiado exitosamente',
        });
    } catch (error) {
        logger.error('Error clearing section cache', {
            error: error instanceof Error ? error.message : 'Unknown error',
            params: request.params,
        });

        return reply.status(500).send({
            success: false,
            error: 'Error al limpiar cache de sección',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}

/**
 * POST /api/statistics/cache/clear/cycle/:academicYearId
 * Limpiar cache de estadísticas de un ciclo completo (Admin only)
 */
export async function clearCycleCache(
    request: FastifyRequest<{ Params: CycleAverageParams }>,
    reply: FastifyReply
) {
    try {
        const { academicYearId } = request.params;

        // Solo administradores pueden limpiar cache
        const user = request.user as RequestUser;
        if (user?.role !== 'ADMIN') {
            return reply.status(403).send({
                success: false,
                error: 'No tienes permisos para limpiar el cache',
                code: 'INSUFFICIENT_PERMISSIONS',
            });
        }

        await cycleStatisticsService.clearCycleCache(request.tenantPrisma, academicYearId);

        logger.info('Cycle cache cleared', {
            userId: user.userId,
            academicYearId,
        });

        return reply.status(200).send({
            success: true,
            message: 'Cache de ciclo limpiado exitosamente',
        });
    } catch (error) {
        logger.error('Error clearing cycle cache', {
            error: error instanceof Error ? error.message : 'Unknown error',
            params: request.params,
        });

        return reply.status(500).send({
            success: false,
            error: 'Error al limpiar cache de ciclo',
            code: 'INTERNAL_SERVER_ERROR',
        });
    }
}
