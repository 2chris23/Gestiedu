/**
 * monitor-storage.job.ts
 *
 * TAREA 5: Monitoreo de Almacenamiento
 *
 * Job que corre cada hora para:
 * 1. Calcular el uso real de storage de cada tenant (tamaño de BD PostgreSQL)
 * 2. Actualizar currentStorage en la Platform DB
 * 3. Emitir alertas cuando un instituto supera el 75% o 90% de su límite
 */
import cron from 'node-cron';
import { Client } from 'pg';
import { platformPrisma } from '../config/database';
import { logger } from '../utils/logger';
import { checkPlanAlerts } from '../services/plan-alerts.service';

const PLATFORM_DB_URL = process.env.PLATFORM_DATABASE_URL || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Obtiene el tamaño en GB de una base de datos PostgreSQL dado su nombre.
 */
async function getTenantDbSizeGB(dbName: string): Promise<number> {
    const urlParts = PLATFORM_DB_URL.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\//);
    if (!urlParts) return 0;

    const [, user, password, host, port] = urlParts;
    const client = new Client({ user, password, host, port: parseInt(port), database: 'postgres' });

    try {
        await client.connect();
        const res = await client.query(
            `SELECT pg_database_size($1)::float8 / (1024 * 1024 * 1024) AS size_gb`,
            [dbName]
        );
        return parseFloat(res.rows[0]?.size_gb ?? '0');
    } catch {
        return 0;
    } finally {
        await client.end();
    }
}

// ─── Alert thresholds ─────────────────────────────────────────────────────────

const THRESHOLDS = {
    CRITICAL: 0.90,   // 90% → alerta crítica
    WARNING: 0.75,    // 75% → alerta de advertencia
};

function getPct(current: number, max: number): number {
    if (max <= 0) return 0;
    return current / max;
}

// ─── Core job ─────────────────────────────────────────────────────────────────

/**
 * Recorre todos los institutos ACTIVOS con BD provisionada,
 * actualiza su currentStorage y emite alertas si corresponde.
 */
export async function runStorageMonitor(): Promise<void> {
    logger.info('[monitor-storage] Iniciando monitoreo de almacenamiento...');

    const institutes = await platformPrisma.institute.findMany({
        where: {
            status: 'ACTIVE',
            databaseName: { not: null },
        },
        select: {
            id: true,
            name: true,
            slug: true,
            databaseName: true,
            maxStorage: true,
            currentStorage: true,
            maxStudents: true,
            currentStudents: true,
            maxTeachers: true,
            currentTeachers: true,
        },
    });

    logger.info(`[monitor-storage] ${institutes.length} institutos activos a verificar`);

    let updated = 0;
    let alerts = 0;

    for (const inst of institutes) {
        try {
            // 1. Calcular tamaño real de la BD del tenant
            const dbSizeGB = await getTenantDbSizeGB(inst.databaseName!);

            // 2. Actualizar currentStorage en Platform DB
            await platformPrisma.institute.update({
                where: { id: inst.id },
                data: { currentStorage: dbSizeGB },
            });
            updated++;

            // 3. Verificar umbrales y emitir alertas en el log
            const storagePct = getPct(dbSizeGB, inst.maxStorage);
            const studentPct = getPct(inst.currentStudents, inst.maxStudents);
            const teacherPct = getPct(inst.currentTeachers, inst.maxTeachers);

            const issues: string[] = [];

            if (storagePct >= THRESHOLDS.CRITICAL)
                issues.push(`💾 Storage al ${Math.round(storagePct * 100)}% (${dbSizeGB.toFixed(2)}/${inst.maxStorage} GB)`);
            if (studentPct >= THRESHOLDS.CRITICAL)
                issues.push(`👥 Estudiantes al ${Math.round(studentPct * 100)}% (${inst.currentStudents}/${inst.maxStudents})`);
            if (teacherPct >= THRESHOLDS.CRITICAL)
                issues.push(`👨‍🏫 Profesores al ${Math.round(teacherPct * 100)}% (${inst.currentTeachers}/${inst.maxTeachers})`);

            if (issues.length > 0) {
                logger.warn(`[monitor-storage] ⚠️ ALERTA CRÍTICA [${inst.name}]:`, { issues });
                alerts += issues.length;
            } else if (
                storagePct >= THRESHOLDS.WARNING ||
                studentPct >= THRESHOLDS.WARNING ||
                teacherPct >= THRESHOLDS.WARNING
            ) {
                logger.warn(`[monitor-storage] ⚡ Advertencia [${inst.name}]: uso al 75%+ en algún recurso`, {
                    storage: `${Math.round(storagePct * 100)}%`,
                    students: `${Math.round(studentPct * 100)}%`,
                    teachers: `${Math.round(teacherPct * 100)}%`,
                });
            }
        } catch (error) {
            logger.error(`[monitor-storage] Error al procesar [${inst.name}]:`, { error });
        }
    }

    logger.info(`[monitor-storage] ✅ Completado: ${updated} actualizados, ${alerts} alertas críticas`);

    // Ejecutar verificación de alertas de plan (estudiantes/profesores/storage)
    await checkPlanAlerts().catch(e =>
        logger.error('[monitor-storage] Error en checkPlanAlerts:', e)
    );
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Inicia el cron job de monitoreo de almacenamiento.
 * Corre cada hora: 0 * * * *
 */
export function startStorageMonitor(): void {
    // Primera ejecución inmediata al arrancar (solo en producción para no demorar el inicio en dev)
    if (process.env.NODE_ENV === 'production') {
        runStorageMonitor().catch(e =>
            logger.error('[monitor-storage] Error en ejecución inicial:', e)
        );
    }

    // Cada hora
    cron.schedule('0 * * * *', async () => {
        await runStorageMonitor().catch(e =>
            logger.error('[monitor-storage] Error en cron:', e)
        );
    });

    logger.info('✅ Storage monitor job programado (cada hora)');
}
