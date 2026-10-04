import { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';
import { platformPrisma, getTenantPrisma } from '../config/database';
import { conLiceo } from '../config/ambito-del-liceo';
import { tirarLoQueNoSirve } from '../services/mantenimiento.service';
import { latido } from '../utils/latido-de-tareas';
import { avisarSiFalla } from '../utils/sin-callar';

/**
 * TAREA: tirar lo que ya no sirve (`services/mantenimiento.service.ts`), una
 * vez al día, liceo por liceo. Borrar lo ya borrado no hace nada: varios
 * procesos a la vez no se estorban. Deja su latido (MANT-*, falla gris).
 */
const CADA = 24 * 60 * 60 * 1000;

export async function setupMantenimientoJob(_server: FastifyInstance) {
    if (process.env.NODE_ENV === 'test') return;
    let corriendo = false;
    const correr = async () => {
        if (corriendo) return;
        corriendo = true;
        let fallo: unknown = null;
        try {
            const liceos = await platformPrisma.institute.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
            for (const liceo of liceos) {
                try {
                    const prisma = await getTenantPrisma(liceo.id);
                    const r = await conLiceo(liceo.id, () => tirarLoQueNoSirve(prisma));
                    if (r.papelera + r.avisos + r.sesiones + r.cambios > 0) logger.info('Mantenimiento: tirado lo viejo', { instituteId: liceo.id, ...r });
                } catch (error) {
                    fallo = error;
                    logger.warn('Mantenimiento: no se pudo con un liceo', {
                        instituteId: liceo.id,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        } catch (error) {
            fallo = error;
        } finally {
            corriendo = false;
            await latido('mantenimiento', CADA, fallo ?? undefined);
        }
    };
    setTimeout(() => void correr().catch(avisarSiFalla('mantenimiento.job')), 10 * 60_000).unref?.();
    setInterval(() => void correr().catch(avisarSiFalla('mantenimiento.job')), CADA).unref?.();
}
