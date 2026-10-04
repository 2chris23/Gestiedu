import { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';
import { platformPrisma, getTenantPrisma } from '../config/database';
import { conLiceo } from '../config/ambito-del-liceo';
import { sacarLaFotoSiFalta } from '../services/cuadro-de-honor.service';
import { latido } from '../utils/latido-de-tareas';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * TAREA: la foto del cuadro de honor de cada sábado (2026-10-04).
 *
 * Al arrancar y cada 6 horas mira, liceo por liceo, si ya está la foto del
 * último sábado; si falta, la saca. Así el sábado se actualiza solo, y si ese
 * día el servidor estaba apagado, se pone al día al volver. La foto es única
 * por alumno y sábado: varios procesos no la duplican. Sin Redis ni colas: lo
 * que impide repetir está en la base.
 */
export async function setupCuadroDeHonorJob(_server: FastifyInstance) {
    if (process.env.NODE_ENV === 'test') return;
    let corriendo = false;
    const correr = async () => {
        if (corriendo) return;
        corriendo = true;
        let fallo: unknown;
        try {
            const liceos = await platformPrisma.institute.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
            for (const liceo of liceos) {
                try {
                    const prisma = await getTenantPrisma(liceo.id);
                    const n = await conLiceo(liceo.id, () => sacarLaFotoSiFalta(prisma, liceo.id));
                    if (n) logger.info('Cuadro de honor: foto del sábado', { instituteId: liceo.id, alumnos: n });
                } catch (error) {
                    fallo = error;
                    logger.warn('Cuadro de honor: no se pudo sacar la foto de un liceo', {
                        instituteId: liceo.id,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        } catch (error) {
            fallo = error;
        } finally {
            corriendo = false;
            await latido('cuadro-de-honor', 6 * 60 * 60 * 1000, fallo);
        }
    };
    // Sin esperar: que un liceo lento no retrase el arranque.
    setTimeout(() => void correr().catch(avisarSiFalla('cuadro-de-honor.job')), 90_000).unref?.();
    setInterval(() => void correr().catch(avisarSiFalla('cuadro-de-honor.job')), 6 * 60 * 60 * 1000).unref?.();
}
