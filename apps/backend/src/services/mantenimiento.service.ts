import type { PrismaClient } from '@prisma/client';
import { limpiarPapeleraVieja, diasQueSeGuardaLoBorrado } from '../utils/papelera';

/**
 * LO QUE CRECE SIN LÍMITE (MANT-01…03, 2026-10-04)
 *
 * Cuatro tablas crecían para siempre sin que nadie las mirara; en un servidor
 * pequeño, el disco lleno tumba a TODOS los liceos a la vez. Cada noche se
 * tira lo que ya no sirve, con su plazo configurable:
 *
 *   papelera (`registros_borrados`)   PAPELERA_DIAS        90  (lo de antes, en el respaldo)
 *   avisos leídos o caducados         AVISOS_DIAS          180 (los `persistent`, nunca)
 *   llaves de sesión caducadas        —                    7 días después de caducar
 *   cambios recibidos (`X-Cambio`)    CAMBIOS_DIAS         90
 *   cambios del liceo (precarga)      CAMBIOS_DEL_LICEO_DIAS 30 (quien lleve más, baja todo otra vez)
 *
 * Lo que NO se toca, a propósito: el rastro de la asistencia por QR (es la
 * prueba de quién firmó), las notas, la asistencia y todo lo del liceo. Eso se
 * guarda siempre; para el disco, el respaldo fuera del servidor.
 *
 * Los cambios recibidos sirven para no aplicar dos veces lo que un teléfono
 * reenvía. Pasados 90 días, un teléfono que no supo que llegó lo habría
 * reenviado hace mucho.
 */

const dias = (variable: string, porDefecto: number) => {
    const v = Number(process.env[variable]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : porDefecto;
};
const haceDias = (n: number, ahora: Date) => new Date(ahora.getTime() - n * 24 * 60 * 60 * 1000);

export interface LoQueSeTiro {
    papelera: number;
    avisos: number;
    sesiones: number;
    cambios: number;
    cambiosDelLiceo: number;
    paquetes: number;
}

export async function tirarLoQueNoSirve(prisma: PrismaClient, ahora = new Date()): Promise<LoQueSeTiro> {
    const p = prisma as any;
    const papelera = await limpiarPapeleraVieja(prisma, diasQueSeGuardaLoBorrado());
    const corteAvisos = haceDias(dias('AVISOS_DIAS', 180), ahora);
    const avisos = await p.notification.deleteMany({
        where: {
            persistent: false,
            OR: [{ expiresAt: { lt: ahora } }, { readAt: { lt: corteAvisos } }, { createdAt: { lt: haceDias(dias('AVISOS_DIAS', 180) * 2, ahora) } }],
        },
    });
    const sesiones = await p.refreshToken.deleteMany({ where: { expiresAt: { lt: haceDias(7, ahora) } } });
    const cambios = await p.cambioRecibido.deleteMany({ where: { recibidoEn: { lt: haceDias(dias('CAMBIOS_DIAS', 90), ahora) } } });
    const delLiceo = await p.cambioDelLiceo?.deleteMany({ where: { momento: { lt: haceDias(dias('CAMBIOS_DEL_LICEO_DIAS', 30), ahora) } } });
    const cortePaquetes = haceDias(7, ahora);
    const paquetes = await p.paqueteDePrecarga?.deleteMany({
        where: {
            OR: [
                { usadoEn: { lt: cortePaquetes } },
                { usadoEn: null, armadoEn: { lt: cortePaquetes } },
            ],
        },
    });
    return {
        papelera,
        avisos: avisos?.count ?? 0,
        sesiones: sesiones?.count ?? 0,
        cambios: cambios?.count ?? 0,
        cambiosDelLiceo: delLiceo?.count ?? 0,
        paquetes: paquetes?.count ?? 0,
    };
}
