/**
 * plan-alerts.service.ts
 *
 * TAREA 6: Alertas Automáticas de Plan
 *
 * Servicio que verifica si algún instituto ha superado el 75% o 90% de sus
 * límites de plan (estudiantes, profesores, storage) y emite alertas en consola
 * y en el log. Diseñado para integrarse en el cron job de monitoreo.
 *
 * En una integración futura se puede extender para enviar notificaciones
 * por email al SuperAdmin o al admin del instituto.
 */

import { platformPrisma } from '../config/database';
import { logger } from '../utils/logger';

export interface PlanAlert {
    instituteId: string;
    instituteName: string;
    resource: 'students' | 'teachers' | 'storage';
    current: number;
    max: number;
    percentUsed: number;
    level: 'warning' | 'critical';
}

const LEVELS = {
    critical: 0.90,
    warning: 0.75,
};

/**
 * Verifica todos los institutos activos y retorna las alertas que correspondan.
 */
export async function checkPlanAlerts(): Promise<PlanAlert[]> {
    const institutes = await platformPrisma.institute.findMany({
        where: { status: 'ACTIVE' },
        select: {
            id: true,
            name: true,
            currentStudents: true,
            maxStudents: true,
            currentTeachers: true,
            maxTeachers: true,
            currentStorage: true,
            maxStorage: true,
        },
    });

    const alerts: PlanAlert[] = [];

    for (const inst of institutes) {
        const checks: Array<{
            resource: PlanAlert['resource'];
            current: number;
            max: number;
        }> = [
                { resource: 'students', current: inst.currentStudents, max: inst.maxStudents },
                { resource: 'teachers', current: inst.currentTeachers, max: inst.maxTeachers },
                { resource: 'storage', current: inst.currentStorage, max: inst.maxStorage },
            ];

        for (const { resource, current, max } of checks) {
            if (max <= 0) continue;
            const pct = current / max;

            let level: PlanAlert['level'] | null = null;
            if (pct >= LEVELS.critical) level = 'critical';
            else if (pct >= LEVELS.warning) level = 'warning';

            if (level) {
                alerts.push({
                    instituteId: inst.id,
                    instituteName: inst.name,
                    resource,
                    current,
                    max,
                    percentUsed: Math.round(pct * 100),
                    level,
                });
            }
        }
    }

    // Log de alertas
    for (const alert of alerts) {
        const icon = alert.level === 'critical' ? '🚨' : '⚡';
        const msg = `${icon} [${alert.level.toUpperCase()}] ${alert.instituteName}: ` +
            `${alert.resource} al ${alert.percentUsed}% (${alert.current}/${alert.max})`;

        if (alert.level === 'critical') {
            logger.error('[plan-alerts] ' + msg);
        } else {
            logger.warn('[plan-alerts] ' + msg);
        }
    }

    if (alerts.length > 0) {
        logger.warn(`[plan-alerts] ${alerts.length} alertas de plan generadas`);
    }

    return alerts;
}

/**
 * Obtiene un resumen de uso para un instituto específico.
 * Útil para el dashboard del SuperAdmin.
 */
export async function getInstituteUsageSummary(instituteId: string) {
    const inst = await platformPrisma.institute.findUnique({
        where: { id: instituteId },
        select: {
            id: true,
            name: true,
            plan: true,
            currentStudents: true,
            maxStudents: true,
            currentTeachers: true,
            maxTeachers: true,
            currentStorage: true,
            maxStorage: true,
            billingStatus: true,
            monthlyPrice: true,
            nextBillingDate: true,
        },
    });

    if (!inst) return null;

    const studentPct = inst.maxStudents > 0 ? Math.round((inst.currentStudents / inst.maxStudents) * 100) : 0;
    const teacherPct = inst.maxTeachers > 0 ? Math.round((inst.currentTeachers / inst.maxTeachers) * 100) : 0;
    const storagePct = inst.maxStorage > 0 ? Math.round((inst.currentStorage / inst.maxStorage) * 100) : 0;

    const hasWarning = studentPct >= 75 || teacherPct >= 75 || storagePct >= 75;
    const hasCritical = studentPct >= 90 || teacherPct >= 90 || storagePct >= 90;

    return {
        ...inst,
        usage: {
            students: { current: inst.currentStudents, max: inst.maxStudents, pct: studentPct },
            teachers: { current: inst.currentTeachers, max: inst.maxTeachers, pct: teacherPct },
            storage: { current: inst.currentStorage, max: inst.maxStorage, pct: storagePct },
        },
        alerts: {
            hasWarning,
            hasCritical,
            level: hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok',
        },
    };
}
