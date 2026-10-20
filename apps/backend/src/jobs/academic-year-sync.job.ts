import { FastifyInstance } from 'fastify';
import { syncAcademicYearStatuses } from '../utils/academic-year.utils';
import { logger } from '../utils/logger';
import { platformPrisma, getTenantPrisma } from '../config/database';
import { latido } from '../utils/latido-de-tareas';
import { unaVezCada } from '../utils/turno-de-la-tarea';

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

    // UNA vez entre todos los procesos (`unaVezCada`), y sin frenar el arranque.
    // Antes cada proceso, al arrancar y esperándolo, abría una conexión a cada
    // liceo: con 4 procesos y 60 liceos la base se quedaba sin clientes y nadie
    // podía entrar. El estado de los años cambia por fecha: una vez cada 6 h sobra.
    const cada = 6 * 60 * 60 * 1000;
    const correr = async () => {
        try {
            await unaVezCada('estado-de-los-anos', cada, syncAllInstitutes);
        } catch (error) {
            logger.error('Error in scheduled academic year sync', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };
    setTimeout(() => void correr(), 30_000).unref?.();
    setInterval(() => void correr(), cada).unref?.();

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
    await latido('estado-de-los-anos', 24 * 60 * 60 * 1000, totalErrors ? `${totalErrors} error(es)` : undefined);
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
