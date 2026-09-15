import { FastifyInstance } from 'fastify';
import { monitoringController } from '../controllers/monitoring.controller';
import { superAdminAuthMiddleware } from '../middleware/superadmin-auth.middleware';

/**
 * Rutas de monitoreo (SuperAdmin only)
 *
 * queryMetric y systemAlert son modelos globales de monitoreo que viven en la DB
 * de plataforma (DATABASE_URL), no en las tenant DBs. Por eso el guard es
 * superAdminAuthMiddleware y no el authenticate/requireAdmin de instituto.
 *
 * Se registra bajo el prefijo /api/superadmin/monitoring (ver routes/index.ts).
 * El health check detallado también va protegido porque expone internals
 * (uptime, slow queries, alertas); el health público es /api/health.
 */
export async function monitoringRoutes(fastify: FastifyInstance) {
    // Health check detallado con métricas
    fastify.get('/health', {
        preHandler: superAdminAuthMiddleware,
    }, monitoringController.healthCheck.bind(monitoringController));

    // Métricas de queries en tiempo real
    fastify.get('/metrics/queries', {
        preHandler: superAdminAuthMiddleware,
    }, monitoringController.getQueryMetrics.bind(monitoringController));

    // Histórico de métricas
    fastify.get('/metrics/history', {
        preHandler: superAdminAuthMiddleware,
    }, monitoringController.getMetricsHistory.bind(monitoringController) as any);

    // Alertas activas
    fastify.get('/alerts', {
        preHandler: superAdminAuthMiddleware,
    }, monitoringController.getAlerts.bind(monitoringController));

    // Estadísticas de alertas
    fastify.get('/alerts/stats', {
        preHandler: superAdminAuthMiddleware,
    }, monitoringController.getAlertStats.bind(monitoringController));

    // Resolver alerta
    fastify.patch('/alerts/:id/resolve', {
        preHandler: superAdminAuthMiddleware,
    }, monitoringController.resolveAlert.bind(monitoringController) as any);
}
