import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Configuración de thresholds
const SLOW_QUERY_THRESHOLD = 1000; // 1 segundo
const VERY_SLOW_QUERY_THRESHOLD = 3000; // 3 segundos
const WARNING_QUERY_THRESHOLD = 500; // 500ms

interface QueryMetrics {
    model: string;
    operation: string;
    duration: number;
    timestamp: Date;
    params?: any;
}

class QueryMonitor {
    private slowQueries: QueryMetrics[] = [];
    private queryCount = 0;
    private totalDuration = 0;

    logQuery(metrics: QueryMetrics) {
        this.queryCount++;
        this.totalDuration += metrics.duration;

        // Log solo queries lentas
        if (metrics.duration >= SLOW_QUERY_THRESHOLD) {
            this.slowQueries.push(metrics);

            const severity = metrics.duration >= VERY_SLOW_QUERY_THRESHOLD ? 'VERY SLOW' : 'SLOW';
            logger.warn(
                `${severity} QUERY [${metrics.duration}ms]:`,
                `${metrics.model}.${metrics.operation}`
            );

            // En producción, aquí podrías enviar a un servicio de monitoreo
            // como Sentry, DataDog, CloudWatch, etc.
            if (process.env.NODE_ENV === 'production') {
                // TODO: Integrar con servicio de alertas
                // Sentry.captureMessage(`Slow query: ${metrics.model}.${metrics.operation}`, 'warning');
            }
        } else if (metrics.duration >= WARNING_QUERY_THRESHOLD) {
            // Log queries moderadamente lentas solo en desarrollo
            if (process.env.NODE_ENV === 'development') {
                logger.debug(
                    `WARNING QUERY [${metrics.duration}ms]:`,
                    `${metrics.model}.${metrics.operation}`
                );
            }
        }
    }

    getMetrics() {
        return {
            totalQueries: this.queryCount,
            averageDuration: this.queryCount > 0 ? Math.round(this.totalDuration / this.queryCount) : 0,
            slowQueries: this.slowQueries.length,
            slowQueriesList: this.slowQueries.slice(-10), // Últimas 10 queries lentas
        };
    }

    reset() {
        this.slowQueries = [];
        this.queryCount = 0;
        this.totalDuration = 0;
    }

    getSlowQueriesSummary() {
        if (this.slowQueries.length === 0) {
            return 'No slow queries detected! ✅';
        }

        const summary = this.slowQueries.reduce((acc, query) => {
            const key = `${query.model}.${query.operation}`;
            if (!acc[key]) {
                acc[key] = {
                    count: 0,
                    totalDuration: 0,
                    maxDuration: 0,
                };
            }
            acc[key].count++;
            acc[key].totalDuration += query.duration;
            acc[key].maxDuration = Math.max(acc[key].maxDuration, query.duration);
            return acc;
        }, {} as Record<string, { count: number; totalDuration: number; maxDuration: number }>);

        return Object.entries(summary)
            .map(([key, stats]) => ({
                query: key,
                count: stats.count,
                avgDuration: Math.round(stats.totalDuration / stats.count),
                maxDuration: stats.maxDuration,
            }))
            .sort((a, b) => b.maxDuration - a.maxDuration);
    }

    // Guardar métricas en la base de datos
    async saveMetrics(prisma: PrismaClient) {
        const metrics = this.getMetrics();

        // Determinar severidad basada en métricas
        let severity = 'NORMAL';
        if (metrics.slowQueries > 20) {
            severity = 'VERY_SLOW';
        } else if (metrics.slowQueries > 10) {
            severity = 'SLOW';
        } else if (metrics.averageDuration > 300) {
            severity = 'WARNING';
        }

        try {
            await prisma.queryMetric.create({
                data: {
                    model: 'SYSTEM',
                    operation: 'AGGREGATE',
                    duration: metrics.averageDuration,
                    severity,
                    totalQueries: metrics.totalQueries,
                    averageDuration: metrics.averageDuration,
                    slowQueriesCount: metrics.slowQueries,
                },
            });

            logger.info(`Metrics saved: ${metrics.totalQueries} queries, avg ${metrics.averageDuration}ms`);
        } catch (error) {
            logger.error('Error saving metrics:', error);
        }
    }
}

export const queryMonitor = new QueryMonitor();

// Configurar Prisma con extensión de monitoreo (Prisma 6+ — $use ya no existe)
export function setupPrismaMonitoring(prisma: PrismaClient) {
    // En Prisma 6, usamos event logging en vez de $use middleware
    // El monitoreo se hace via event listeners configurados en PrismaClient

    // Log de configuración
    logger.info('Prisma Query Monitoring enabled');
    logger.info(`   Slow query threshold: ${SLOW_QUERY_THRESHOLD}ms`);
    logger.info(`   Very slow threshold: ${VERY_SLOW_QUERY_THRESHOLD}ms`);
    logger.info(`   Warning threshold: ${WARNING_QUERY_THRESHOLD}ms`);
}

// Endpoint helper para exponer métricas
export function getQueryMetrics() {
    return {
        ...queryMonitor.getMetrics(),
        slowQueriesSummary: queryMonitor.getSlowQueriesSummary(),
    };
}

// Job para reportar métricas periódicamente
export function startMetricsReporting(intervalMinutes: number = 60) {
    if (process.env.NODE_ENV !== 'production') {
        logger.info('Metrics reporting disabled in development');
        return;
    }

    setInterval(() => {
        const metrics = queryMonitor.getMetrics();
        const summary = queryMonitor.getSlowQueriesSummary();

        logger.info('QUERY METRICS REPORT');
        logger.info(`   Total queries: ${metrics.totalQueries}`);
        logger.info(`   Average duration: ${metrics.averageDuration}ms`);
        logger.info(`   Slow queries: ${metrics.slowQueries}`);

        if (typeof summary !== 'string' && summary.length > 0) {
            logger.warn('Top Slow Queries:');
            summary.slice(0, 5).forEach((item, i) => {
                logger.warn(`   ${i + 1}. ${item.query}`);
                logger.warn(`      Count: ${item.count}, Avg: ${item.avgDuration}ms, Max: ${item.maxDuration}ms`);
            });
        }

        // Reset métricas después del reporte
        queryMonitor.reset();
    }, intervalMinutes * 60 * 1000);

    logger.info(`Metrics reporting started (every ${intervalMinutes} minutes)`);
}
