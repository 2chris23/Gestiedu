import { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';
import { platformPrisma, getTenantPrisma } from '../config/database';
import { conLiceo } from '../config/ambito-del-liceo';
import { recordarCuotas } from '../services/recordatorio-de-cuotas.service';
import { latido } from '../utils/latido-de-tareas';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * TAREA: recordar las cuotas por vencer (2026-10-01).
 *
 * Al arrancar y cada 6 horas recorre los liceos activos. Que corra más de una
 * vez al día (o en varios procesos) no repite avisos: cada recordatorio queda
 * anotado y es único (ver `recordarCuotas`).
 */
export async function setupRecordatorioDeCuotasJob(server: FastifyInstance) {
    if (process.env.NODE_ENV === 'test') return;
    const correr = async () => {
        const liceos = await platformPrisma.institute.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
        let enviados = 0;
        let fallo: unknown;
        for (const liceo of liceos) {
            try {
                const prisma = await getTenantPrisma(liceo.id);
                enviados += await conLiceo(liceo.id, () => recordarCuotas(prisma, liceo.id, (server as any).io));
            } catch (error) {
                fallo = error;
                logger.warn('No se pudieron recordar las cuotas de un liceo', {
                    instituteId: liceo.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        if (enviados) logger.info('Recordatorios de cuota enviados', { enviados });
        await latido('recordatorio-de-cuotas', 6 * 60 * 60 * 1000, fallo);
    };
    // Sin esperar: que un liceo lento no retrase el arranque.
    setTimeout(() => void correr().catch(avisarSiFalla('recordatorio-de-cuotas.job')), 60_000).unref?.();
    setInterval(() => void correr().catch(avisarSiFalla('recordatorio-de-cuotas.job')), 6 * 60 * 60 * 1000).unref?.();
}
