import { FastifyRequest, FastifyReply } from 'fastify';
import { getQueryMetrics } from '../utils/query-monitor';
import { alertService } from '../services/alert.service';
// SEGURIDAD: queryMetric/systemAlert son modelos globales de monitoreo que viven
// en la DB principal (DATABASE_URL), no en las tenant DBs. No contienen datos
// de tenant. El singleton legacy es su único consumidor legítimo restante.
import { prisma } from '../config/database';
import { leerEstado, saludDeLosRespaldos } from '../services/respaldos-programados.service';
import { carpetaDeRespaldos } from '../services/respaldos.service';
import { losLatidos } from '../utils/latido-de-tareas';
import { statfs, readFile } from 'fs/promises';
import { monitorEventLoopDelay } from 'perf_hooks';
import { X509Certificate } from 'crypto';

/**
 * EL PROCESO ATASCADO (robustez, 2026-10-04): un reporte grande o un cálculo
 * largo en el mismo proceso que atiende a todos hace esperar a TODOS. Se mide
 * el retraso del bucle de eventos (p99 del último minuto); por encima de
 * 200 ms, algo está acaparando el proceso.
 */
const retrasoDelBucle = monitorEventLoopDelay({ resolution: 20 });
retrasoDelBucle.enable();
let reiniciadoEn = Date.now();
export function elBucle(): { p99ms: number; maxMs: number } {
    const r = { p99ms: Math.round(retrasoDelBucle.percentile(99) / 1e6), maxMs: Math.round(retrasoDelBucle.max / 1e6) };
    if (Date.now() - reiniciadoEn > 60_000) {
        retrasoDelBucle.reset();
        reiniciadoEn = Date.now();
    }
    return r;
}

/**
 * EL CERTIFICADO (robustez, 2026-10-04): vencido, la app deja fuera a TODOS
 * los liceos a la vez. Con `CERTIFICADO_TLS` (la ruta del .pem que sirve
 * nginx, montada de solo lectura), el panel dice cuántos días le quedan y avisa
 * por debajo de 14.
 */
export async function elCertificado(ruta = process.env.CERTIFICADO_TLS): Promise<{ dias: number; vence: string } | null> {
    if (!ruta) return null;
    try {
        const cert = new X509Certificate(await readFile(ruta));
        const vence = new Date(cert.validTo);
        return { dias: Math.floor((vence.getTime() - Date.now()) / 86_400_000), vence: vence.toISOString() };
    } catch {
        return null;
    }
}

/** Las tareas que tienen que latir (las que no han latido nunca salen «atrasada»). */
export const TAREAS_QUE_LATEN = ['mantenimiento', 'cuadro-de-honor', 'recordatorio-de-cuotas', 'estado-de-los-anos', 'almacenamiento'];

/**
 * El disco donde caen los respaldos (y, en un servidor pequeño, la base): lleno,
 * se caen TODOS los liceos a la vez. Por debajo del 10 % libre, crítico.
 */
export async function elDisco(carpeta = carpetaDeRespaldos()): Promise<{ libreGB: number; totalGB: number; libre: number } | null> {
    try {
        const s = await statfs(carpeta);
        const total = Number(s.blocks) * Number(s.bsize);
        const libre = Number(s.bavail) * Number(s.bsize);
        if (!total) return null;
        const gb = (n: number) => Math.round((n / 1024 ** 3) * 10) / 10;
        return { libreGB: gb(libre), totalGB: gb(total), libre: Math.round((libre / total) * 1000) / 1000 };
    } catch {
        return null;
    }
}

export class MonitoringController {
    // Endpoint para obtener métricas de queries en tiempo real
    async getQueryMetrics(request: FastifyRequest, reply: FastifyReply) {
        const metrics = getQueryMetrics();

        return reply.status(200).send({
            success: true,
            data: metrics,
            message: 'Query metrics retrieved successfully',
        });
    }

    // Endpoint para obtener histórico de métricas
    async getMetricsHistory(request: FastifyRequest<{ Querystring: { period?: string } }>, reply: FastifyReply) {
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
    }

    // Endpoint para obtener alertas activas
    async getAlerts(request: FastifyRequest, reply: FastifyReply) {
        const alerts = await alertService.getActiveAlerts();

        return reply.status(200).send({
            success: true,
            data: {
                alerts,
                count: alerts.length,
            },
        });
    }

    // Endpoint para resolver una alerta
    async resolveAlert(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        const alertId = request.params.id;
        const alert = await alertService.resolveAlert(alertId);

        return reply.status(200).send({
            success: true,
            data: alert,
            message: 'Alert resolved successfully',
        });
    }

    // Endpoint para obtener estadísticas de alertas
    async getAlertStats(request: FastifyRequest, reply: FastifyReply) {
        const stats = await alertService.getAlertStats();

        return reply.status(200).send({
            success: true,
            data: stats,
        });
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

            // Los respaldos, desde el `estado.json` que deja el contenedor de
            // respaldos. «atrasado» sale aunque nadie haya visto un error: es
            // el caso de un contenedor que se paró sin decir nada.
            const estadoDeRespaldos = leerEstado();
            const respaldos = saludDeLosRespaldos(estadoDeRespaldos);
            if (respaldos === 'fallo' || respaldos === 'atrasado') status = 'critical';

            // FALLA GRIS: una tarea que dejó de correr no da error, solo deja
            // de latir (`utils/latido-de-tareas.ts`).
            const tareas = await losLatidos(TAREAS_QUE_LATEN);
            const tareasMal = TAREAS_QUE_LATEN.filter((t) => !tareas[t] || tareas[t].salud !== 'bien');
            if (tareasMal.length && status === 'healthy') status = 'degraded';
            const disco = await elDisco();
            if (disco && disco.libre < 0.1) status = 'critical';
            const bucle = elBucle();
            if (bucle.p99ms > 200 && status === 'healthy') status = 'degraded';
            const certificado = await elCertificado();
            if (certificado && certificado.dias < 14) status = certificado.dias < 3 ? 'critical' : status === 'healthy' ? 'degraded' : status;

            const health = {
                status,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                respaldos: {
                    salud: respaldos,
                    ultimaVez: estadoDeRespaldos?.ultimaVez ?? null,
                    ultimaVezBien: estadoDeRespaldos?.ultimaVezBien ?? null,
                    liceos: estadoDeRespaldos?.liceos ?? null,
                    guardados: estadoDeRespaldos?.guardados ?? null,
                    copiaFuera: estadoDeRespaldos?.copiaFuera ?? null,
                },
                tareas,
                tareasMal,
                disco,
                bucle,
                certificado,
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
            // Único catch que se conserva: un health check debe responder 503
            // "unhealthy" y no el 500 genérico del handler central. El detalle del
            // error va al log del servidor, nunca al body.
            console.error('Error in health check:', error);
            return reply.status(503).send({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
            });
        }
    }
}

export const monitoringController = new MonitoringController();
