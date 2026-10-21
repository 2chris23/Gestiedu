// SEGURIDAD: systemAlert es un modelo global de monitoreo (no datos de tenant).
// Estas tablas viven en la DB principal (DATABASE_URL), no en las tenant DBs,
// por eso usan el singleton legacy. NUNCA usar este cliente para datos de tenant.
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export enum AlertType {
    SLOW_QUERIES = 'SLOW_QUERIES',
    HIGH_LOAD = 'HIGH_LOAD',
    DB_ERROR = 'DB_ERROR',
    MEMORY_LEAK = 'MEMORY_LEAK'
}

export enum AlertSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

interface CreateAlertData {
    type: AlertType | string;
    severity: AlertSeverity | string;
    message: string;
    data?: any;
}

class AlertService {
    // Crear una nueva alerta
    async createAlert(alertData: CreateAlertData) {
        try {
            const alert = await prisma.systemAlert.create({
                data: {
                    type: alertData.type,
                    severity: alertData.severity,
                    message: alertData.message,
                    data: alertData.data ? JSON.stringify(alertData.data) as any : null
                }
            });

            // Log para admins
            logger.warn(`ALERT [${alert.severity}]: ${alert.message}`);

            // En producción, aquí podrías enviar notificaciones
            // - Email a admins
            // - Slack webhook
            // - Push notification
            // - Sentry
            if (process.env.NODE_ENV === 'production') {
                // TODO: Integrar con sistema de notificaciones
                // await this.sendAlertNotification(alert);
            }

            return alert;
        } catch (error) {
            logger.error('Error creating alert:', error);
            return null;
        }
    }

    // Obtener alertas activas
    async getActiveAlerts(limit = 50) {
        return await prisma.systemAlert.findMany({
            where: { resolved: false },
            orderBy: [
                { severity: 'desc' },
                { createdAt: 'desc' }
            ],
            take: limit
        });
    }

    // Limpiar alertas antiguas resueltas
    async cleanupOldAlerts(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await prisma.systemAlert.deleteMany({
            where: {
                resolved: true,
                resolvedAt: { lte: cutoffDate }
            }
        });

        logger.info(`Cleaned up ${result.count} old alerts`);
        return result;
    }

    // Verificar y crear alertas basadas en métricas
    async checkAndCreateAlerts(metrics: any) {
        const alerts = [];

        // Alerta: Queries lentas excesivas
        if (metrics.slowQueries > 10) {
            const alert = await this.createAlert({
                type: AlertType.SLOW_QUERIES,
                severity: metrics.slowQueries > 20 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
                message: `Detectadas ${metrics.slowQueries} queries lentas en el sistema`,
                data: {
                    slowQueries: metrics.slowQueries,
                    totalQueries: metrics.totalQueries,
                    averageDuration: metrics.averageDuration,
                    slowQueriesSummary: metrics.slowQueriesSummary
                }
            });

            if (alert) alerts.push(alert);
        }

        // Alerta: Promedio de duración muy alto
        if (metrics.averageDuration > 500) {
            const alert = await this.createAlert({
                type: AlertType.HIGH_LOAD,
                severity: metrics.averageDuration > 1000 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
                message: `Promedio de duración de queries elevado: ${metrics.averageDuration}ms`,
                data: {
                    averageDuration: metrics.averageDuration,
                    totalQueries: metrics.totalQueries
                }
            });

            if (alert) alerts.push(alert);
        }

        return alerts;
    }
}

export const alertService = new AlertService();
export default alertService;
