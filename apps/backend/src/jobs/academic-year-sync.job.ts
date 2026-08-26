import { FastifyInstance } from 'fastify';
import { syncAcademicYearStatuses } from '../utils/academic-year.utils';
import { logger } from '../utils/logger';
import { platformPrisma, getTenantPrisma } from '../config/database';

/**
 * CRON JOB: Sincronización Automática de Status de Años Académicos
 * 
 * Se ejecuta diariamente para actualizar automáticamente
 * los status de todos los años académicos basándose en fechas.
 * 
 * Multi-tenant: Sincroniza TODOS los institutos activos.
 */

export async function setupAcademicYearCronJob(server: FastifyInstance) {
    // En tests, no conectar a la BD de Platform al arrancar el servidor
    if (process.env.NODE_ENV === 'test') {
        logger.info('Skipping academic year sync in test environment');
        return;
    }

    // Sincronizar al inicio del servidor — todos los institutos
    logger.info('Running initial academic year status sync for all institutes...');
    await syncAllInstitutes();

    // Programar ejecución diaria (24 horas en milisegundos)
    const cronInterval = 24 * 60 * 60 * 1000;

    setInterval(async () => {
        try {
            logger.info('Running scheduled academic year status sync...');
            await syncAllInstitutes();
        } catch (error) {
            logger.error('Error in scheduled academic year sync', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }, cronInterval);

    logger.info('Academic year cron job scheduled (daily)');
}

/**
 * Sincroniza los status de años académicos de TODOS los institutos activos.
 * SEGURIDAD: lee institutos de la platform DB y sincroniza cada uno en SU
 * tenant DB vía getTenantPrisma (nunca el singleton).
 */
async function syncAllInstitutes() {
    const institutes = await platformPrisma.institute.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
    });

    let totalUpdated = 0;
    let totalErrors = 0;

    for (const institute of institutes) {
        try {
            const tenantPrisma = await getTenantPrisma(institute.id);
            const result = await syncAcademicYearStatuses(tenantPrisma, institute.id);
            totalUpdated += result.updated;
            totalErrors += result.errors;
        } catch (error) {
            totalErrors++;
            logger.error('Error syncing institute academic years', {
                instituteId: institute.id,
                error: error instanceof Error ? error.message : 'Unknown',
            });
        }
    }

    logger.info('Academic year sync completed for all institutes', {
        institutes: institutes.length,
        totalUpdated,
        totalErrors,
    });
}

/**
 * Endpoint manual para forzar sincronización (solo admin)
 */
export async function forceSyncAcademicYears(
    request: any,
    reply: any
) {
    try {
        const instituteId = (request.user as any)?.instituteId ?? (request as any).institute?.id;
        if (!instituteId) {
            return reply.status(401).send({ error: 'No autenticado', code: 'UNAUTHORIZED' });
        }

        logger.info('Manual academic year sync triggered', {
            userId: request.user?.userId,
            instituteId,
        });

        // SEGURIDAD: sincronizar en la tenant DB del usuario autenticado
        const tenantPrisma = await getTenantPrisma(instituteId);
        const result = await syncAcademicYearStatuses(tenantPrisma, instituteId);

        return reply.status(200).send({
            success: true,
            message: 'Academic year statuses synchronized',
            ...result,
        });
    } catch (error) {
        logger.error('Error in manual sync', {
            error: error instanceof Error ? error.message : 'Unknown',
        });

        return reply.status(500).send({
            success: false,
            error: 'Failed to sync academic years',
        });
    }
}
