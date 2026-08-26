import { FastifyRequest, FastifyReply } from 'fastify';
import { getQueryMetrics } from '../utils/query-monitor';
import { alertService } from '../services/alert.service';
// SEGURIDAD: queryMetric/systemAlert son modelos globales de monitoreo que viven
// en la DB principal (DATABASE_URL), no en las tenant DBs. No contienen datos
// de tenant. El singleton legacy es su único consumidor legítimo restante.
import { prisma } from '../config/database';

export class MonitoringController {
    // Endpoint para obtener métricas de queries en tiempo real
    async getQueryMetrics(request: FastifyRequest, reply: FastifyReply) {
        try {
            const metrics = getQueryMetrics();

            return reply.status(200).send({
                success: true,
                data: metrics,
                message: 'Query metrics retrieved successfully',
            });
        } catch (error) {
            console.error('Error getting query metrics:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to retrieve query metrics',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    // Endpoint para obtener histórico de métricas
    async getMetricsHistory(request: FastifyRequest<{ Querystring: { period?: string } }>, reply: FastifyReply) {
        try {
            const period = request.query.period || '24h';
            const hours = period.endsWith('h') ? parseInt(period) : 24;

            const since = new Date(Date.now() - hours * 60 * 60 * 1000);

            const metrics = await prisma.queryMetric.findMany({
                where: {
                    timestamp: { gte: since },
                },
                orderBy: { timestamp: 'desc' },
            });

            return reply.status(200).send({
                success: true,
                data: {
                    period: `${hours}h`,
                    metrics,
                    count: metrics.length,
                },
            });
        } catch (error) {
            console.error('Error getting metrics history:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to retrieve metrics history',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    // Endpoint para obtener alertas activas
    async getAlerts(request: FastifyRequest, reply: FastifyReply) {
        try {
            const alerts = await alertService.getActiveAlerts();

            return reply.status(200).send({
                success: true,
                data: {
                    alerts,
                    count: alerts.length,
                },
            });
        } catch (error) {
            console.error('Error getting alerts:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to retrieve alerts',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    // Endpoint para resolver una alerta
    async resolveAlert(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        try {
            const alertId = request.params.id;
            const alert = await alertService.resolveAlert(alertId);

            return reply.status(200).send({
                success: true,
                data: alert,
                message: 'Alert resolved successfully',
            });
        } catch (error) {
            console.error('Error resolving alert:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to resolve alert',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    // Endpoint para obtener estadísticas de alertas
    async getAlertStats(request: FastifyRequest, reply: FastifyReply) {
        try {
            const stats = await alertService.getAlertStats();

            return reply.status(200).send({
                success: true,
                data: stats,
            });
        } catch (error) {
            console.error('Error getting alert stats:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to retrieve alert stats',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    // Endpoint de health check mejorado con métricas
    async healthCheck(request: FastifyRequest, reply: FastifyReply) {
        try {
            const metrics = getQueryMetrics();
            const activeAlerts = await alertService.getActiveAlerts();

            // Determinar estado de salud basado en métricas
            let status = 'healthy';
            if (activeAlerts.some(a => a.severity === 'CRITICAL')) {
                status = 'critical';
            } else if (metrics.slowQueries > 10) {
                status = 'degraded';
            }

            const health = {
                status,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                metrics: {
                    queries: {
                        total: metrics.totalQueries,
                        average: metrics.averageDuration,
                        slow: metrics.slowQueries,
                    },
                    alerts: {
                        active: activeAlerts.length,
                        critical: activeAlerts.filter(a => a.severity === 'CRITICAL').length,
                    },
                },
            };

            const statusCode = status === 'critical' ? 503 : status === 'degraded' ? 200 : 200;
            return reply.status(statusCode).send(health);
        } catch (error) {
            console.error('Error in health check:', error);
            return reply.status(503).send({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}

export const monitoringController = new MonitoringController();
