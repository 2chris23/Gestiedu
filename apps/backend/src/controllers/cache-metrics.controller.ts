import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { cacheMetrics } from '../utils/cache-metrics';
import { superAdminAuthMiddleware } from '../middleware/superadmin-auth.middleware';

/**
 * Rutas para métricas de cache (SuperAdmin only)
 */
export async function cacheMetricsRoutes(fastify: FastifyInstance) {
    /**
     * GET /api/superadmin/metrics/cache
     * Obtiene métricas actuales del cache
     */
    fastify.route({
        method: 'GET',
        url: '/api/superadmin/metrics/cache',
        preHandler: superAdminAuthMiddleware,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const metrics = cacheMetrics.getDetailedMetrics();
                return reply.send({
                    success: true,
                    metrics,
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                fastify.log.error(error, 'Error obteniendo métricas de cache');
                return reply.status(500).send({
                    error: 'Error al obtener métricas de cache',
                });
            }
        },
    });

    /**
     * POST /api/superadmin/metrics/cache/reset
     * Resetea las métricas de cache
     */
    fastify.route({
        method: 'POST',
        url: '/api/superadmin/metrics/cache/reset',
        preHandler: superAdminAuthMiddleware,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const oldMetrics = cacheMetrics.getMetrics();
                cacheMetrics.reset();

                return reply.send({
                    success: true,
                    message: 'Métricas reseteadas exitosamente',
                    previousMetrics: oldMetrics,
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                fastify.log.error(error, 'Error reseteando métricas de cache');
                return reply.status(500).send({
                    error: 'Error al resetear métricas de cache',
                });
            }
        },
    });
}
