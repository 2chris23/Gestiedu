import cron from 'node-cron';
import { queryMonitor, getQueryMetrics } from '../utils/query-monitor';
import { alertService } from '../services/alert.service';
// SEGURIDAD: queryMetric vive en la DB principal (DATABASE_URL) — es un modelo
// global de monitoreo, no datos de tenant. Singleton legacy legítimo aquí.
import { prisma } from '../config/database';

// Job que se ejecuta cada 5 minutos
export function startMetricsCollector() {
    // Ejecutar cada 5 minutos: */5 * * * *
    cron.schedule('*/5 * * * *', async () => {
        try {
            console.log('\n🔄 Running metrics collector job...');

            // Obtener métricas actuales
            const metrics = getQueryMetrics();

            // Guardar métricas en la DB principal (queryMetric es global de monitoreo)
            await queryMonitor.saveMetrics(prisma);

            // Verificar y crear alertas si es necesario
            const alerts = await alertService.checkAndCreateAlerts(metrics);

            if (alerts.length > 0) {
                console.log(`⚠️  Created ${alerts.length} new alerts`);
            }

            // Resetear métricas después de guardar
            queryMonitor.reset();

            console.log('✅ Metrics collector job completed\n');
        } catch (error) {
            console.error('❌ Error in metrics collector job:', error);
        }
    });

    console.log('✅ Metrics collector job scheduled (every 5 minutes)');
}

//Job que se ejecuta diariamente para limpiar alertas antiguas
export function startAlertCleanup() {
    // Ejecutar diariamente a las 3:00 AM: 0 3 * * *
    cron.schedule('0 3 * * *', async () => {
        try {
            console.log('\n🗑️  Running alert cleanup job...');

            // Limpiar alertas resueltas de más de 30 días
            await alertService.cleanupOldAlerts(30);

            console.log('✅ Alert cleanup job completed\n');
        } catch (error) {
            console.error('❌ Error in alert cleanup job:', error);
        }
    });

    console.log('✅ Alert cleanup job scheduled (daily at 3:00 AM)');
}

// Iniciar todos los jobs
export function startAllJobs() {
    startMetricsCollector();
    startAlertCleanup();
    console.log('🚀 All monitoring jobs started');
}
