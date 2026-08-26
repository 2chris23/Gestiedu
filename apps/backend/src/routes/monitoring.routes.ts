import { FastifyInstance } from 'fastify';
import { monitoringController } from '../controllers/monitoring.controller';

export async function monitoringRoutes(fastify: FastifyInstance) {
    // Health check (público)
    fastify.get('/health', monitoringController.healthCheck.bind(monitoringController));

    // Métricas de queries en tiempo real (protegido - solo admins)
    fastify.get('/metrics/queries', {
        preHandler: [fastify.authenticate, fastify.authorize(['ADMIN'])],
    }, monitoringController.getQueryMetrics.bind(monitoringController));

    // Histórico de métricas (protegido - solo admins)
    fastify.get('/metrics/history', {
        preHandler: [fastify.authenticate, fastify.authorize(['ADMIN'])],
    }, monitoringController.getMetricsHistory.bind(monitoringController) as any);

    // Alertas activas (protegido - solo admins)
    fastify.get('/alerts', {
        preHandler: [fastify.authenticate, fastify.authorize(['ADMIN'])],
    }, monitoringController.getAlerts.bind(monitoringController));

    // Resolver alerta (protegido - solo admins)
    fastify.patch('/alerts/:id/resolve', {
        preHandler: [fastify.authenticate, fastify.authorize(['ADMIN'])],
    }, monitoringController.resolveAlert.bind(monitoringController) as any);

    // Estadísticas de alertas (protegido - solo admins)
    fastify.get('/alerts/stats', {
        preHandler: [fastify.authenticate, fastify.authorize(['ADMIN'])],
    }, monitoringController.getAlertStats.bind(monitoringController));
}
