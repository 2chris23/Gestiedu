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
 * Obtiene el año académico actual basándose en la fecha de hoy
 * AUTOMÁTICO: No depende del campo status
 */
export async function getCurrentAcademicYear(prisma: PrismaClient, instituteId: string): Promise<AcademicYearInfo | null> {
    try {
        const today = new Date();

        // Buscar el año académico que contiene la fecha actual
        const academicYear = await prisma.academicYear.findFirst({
            where: {
                instituteId,
                startDate: { lte: today },
                endDate: { gte: today },
            },
            orderBy: {
                startDate: 'desc', // El más reciente si hay solapamiento
            },
        });

        if (!academicYear) {
            logger.warn('No active academic year found for current date', { today });
            return null;
        }

        return {
            ...academicYear,
            isCurrent: true,
            isCompleted: false,
            isUpcoming: false,
        };
    } catch (error) {
        logger.error('Error getting current academic year', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
    }
}

/**
 * Obtiene información de un año académico específico con flags calculados
 */
export async function getAcademicYearInfo(
    prisma: PrismaClient,
    academicYearId: string
): Promise<AcademicYearInfo | null> {
    try {
        const academicYear = await prisma.academicYear.findUnique({
            where: { id: academicYearId },
        });

        if (!academicYear) {
            return null;
        }

        const today = new Date();
        const isCurrent = today >= academicYear.startDate && today <= academicYear.endDate;
        const isCompleted = today > academicYear.endDate;
        const isUpcoming = today < academicYear.startDate;

        return {
            ...academicYear,
            isCurrent,
            isCompleted,
            isUpcoming,
        };
    } catch (error) {
        logger.error('Error getting academic year info', {
            error: error instanceof Error ? error.message : 'Unknown error',
            academicYearId,
        });
        return null;
    }
}

/**
 * Obtiene todos los años académicos con sus estados calculados automáticamente
 */
export async function getAllAcademicYearsWithStatus(prisma: PrismaClient, instituteId: string): Promise<AcademicYearInfo[]> {
    try {
        const academicYears = await prisma.academicYear.findMany({
            where: { instituteId },
            orderBy: { startDate: 'desc' },
        });

        const today = new Date();

        return academicYears.map(ay => {
            const isCurrent = today >= ay.startDate && today <= ay.endDate;
            const isCompleted = today > ay.endDate;
            const isUpcoming = today < ay.startDate;

            return {
                ...ay,
                isCurrent,
                isCompleted,
                isUpcoming,
            };
        });
    } catch (error) {
        logger.error('Error getting all academic years', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return [];
    }
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

/**
 * Obtiene el enrollment activo de un estudiante en el ciclo actual
 * AUTOMÁTICO: Detecta el ciclo actual por fechas
 */
export async function getStudentCurrentEnrollment(prisma: PrismaClient, studentId: string, instituteId: string): Promise<{
    enrollmentId: string;
    sectionId: string;
    sectionName: string;
    grade: number;
    section: string;
    academicYearId: string;
    academicYearName: string;
} | null> {
    try {
        const currentYear = await getCurrentAcademicYear(prisma, instituteId);

        if (!currentYear) {
            logger.warn('No current academic year found', { studentId });
            return null;
        }

        // Buscar enrollment del estudiante en el año actual
        const enrollment = await prisma.studentClassroom.findFirst({
            where: {
                studentId,
                academicYearId: currentYear.id,
                isActive: true,
            },
            include: {
                classroom: {
                    select: {
                        id: true,
                        name: true,
                        grade: true,
                        section: true,
                    },
                },
            },
        });

        if (!enrollment) {
            logger.warn('Student has no active enrollment in current year', {
                studentId,
                currentYearId: currentYear.id,
            });
            return null;
        }

        return {
            enrollmentId: enrollment.id,
            sectionId: enrollment.classroom.id,
            sectionName: enrollment.classroom.name,
            grade: enrollment.classroom.grade,
            section: enrollment.classroom.section,
            academicYearId: currentYear.id,
            academicYearName: currentYear.name,
        };
    } catch (error) {
        logger.error('Error getting student current enrollment', {
            error: error instanceof Error ? error.message : 'Unknown error',
            studentId,
        });
        return null;
    }
}

/**
 * Valida que un año académico esté correctamente configurado
 */
export function validateAcademicYearDates(
    startDate: Date,
    endDate: Date
): { valid: boolean; error?: string } {
    if (startDate >= endDate) {
        return {
            valid: false,
            error: 'La fecha de inicio debe ser anterior a la fecha de fin',
        };
    }

    // Validar duración razonable (entre 6 meses y 18 meses)
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationMonths = durationMs / (1000 * 60 * 60 * 24 * 30);

    if (durationMonths < 6) {
        return {
            valid: false,
            error: 'El ciclo escolar debe durar al menos 6 meses',
        };
    }

    if (durationMonths > 18) {
        return {
            valid: false,
            error: 'El ciclo escolar no puede durar más de 18 meses',
        };
    }

    return { valid: true };
}
