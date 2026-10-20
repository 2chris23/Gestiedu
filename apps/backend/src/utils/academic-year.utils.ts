import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

/**
 * UTILIDAD DE GESTIÓN DE AÑOS ACADÉMICOS
 * 
 * Proporciona métodos para detectar automáticamente el ciclo escolar actual
 * basándose en fechas (startDate, endDate) en lugar de depender del campo status.
 * 
 * SEGURIDAD: Todas las funciones que tocan la BD reciben un PrismaClient como
 * primer parámetro (la tenant DB del instituto correspondiente). No se usa el
 * singleton.
 */

export interface AcademicYearInfo {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    status: string;
    isCurrent: boolean;      // Si está activo según fechas
    isCompleted: boolean;    // Si ya terminó
    isUpcoming: boolean;     // Si aún no ha comenzado
}

/**
 * Actualiza automáticamente los campos status de TODOS los años académicos
 * basándose en las fechas actuales
 * 
 * Esta función se puede llamar:
 * - Manualmente desde un endpoint admin
 * - Automáticamente con un cron job diario
 * - Al inicio del servidor
 */
export async function syncAcademicYearStatuses(prisma: PrismaClient, instituteId: string): Promise<{
    updated: number;
    errors: number;
    current: string | null;
}> {
    try {
        const today = new Date();
        let updated = 0;
        let errors = 0;
        let currentYearName: string | null = null;

        // Obtener todos los años académicos
        const academicYears = await prisma.academicYear.findMany({
            where: { instituteId },
        });

        // Actualizar cada uno según su fecha
        for (const ay of academicYears) {
            let newStatus: string;

            if (today >= ay.startDate && today <= ay.endDate) {
                newStatus = 'ACTIVE';
                currentYearName = ay.name;
            } else if (today > ay.endDate) {
                newStatus = 'COMPLETED';
            } else {
                newStatus = 'UPCOMING';
            }

            // Solo actualizar si cambió
            if (ay.status !== newStatus) {
                try {
                    await prisma.academicYear.update({
                        where: { id: ay.id },
                        data: { status: newStatus as any },
                    });
                    updated++;
                    logger.info('Academic year status updated', {
                        yearId: ay.id,
                        yearName: ay.name,
                        oldStatus: ay.status,
                        newStatus,
                    });
                } catch (error) {
                    errors++;
                    logger.error('Error updating academic year status', {
                        yearId: ay.id,
                        error: error instanceof Error ? error.message : 'Unknown',
                    });
                }
            }
        }

        logger.info('Academic year status sync completed', {
            total: academicYears.length,
            updated,
            errors,
            currentYear: currentYearName,
        });

        return { updated, errors, current: currentYearName };
    } catch (error) {
        logger.error('Error syncing academic year statuses', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { updated: 0, errors: 1, current: null };
    }
}