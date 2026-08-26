/**
 * PLAN LIMITS MIDDLEWARE
 *
 * Intercepta creación de usuarios (STUDENT / TEACHER) y verifica que el instituto
 * no haya alcanzado su límite según el plan contratado.
 *
 * Uso en routes:
 *   preHandler: [authenticate, requireAdmin, checkStudentLimit]
 *   preHandler: [authenticate, requireAdmin, checkTeacherLimit]
 *
 * También exporta helpers para incrementar/decrementar contadores desde el controller.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { platformPrisma } from '../config/database';
import { logger } from '../utils/logger';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface PlanLimitsData {
    id: string;
    plan: string;
    maxStudents: number;
    currentStudents: number;
    maxTeachers: number;
    currentTeachers: number;
    billingStatus: string;
}

// ─── Helper: obtener límites del instituto ───────────────────────────────────

async function getInstituteLimits(instituteId: string): Promise<PlanLimitsData | null> {
    try {
        return await platformPrisma.institute.findUnique({
            where: { id: instituteId },
            select: {
                id: true,
                plan: true,
                maxStudents: true,
                currentStudents: true,
                maxTeachers: true,
                currentTeachers: true,
                billingStatus: true,
            },
        }) as PlanLimitsData | null;
    } catch (error) {
        logger.error('Error obteniendo límites de plan', { instituteId, error });
        return null;
    }
}

// ─── Middleware: verificar límite de estudiantes ──────────────────────────────

/**
 * Verifica que el instituto no haya alcanzado su límite de estudiantes.
 * Debe usarse en preHandler de POST /api/users cuando role === 'STUDENT'.
 */
export async function checkStudentLimit(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Solo aplica si el body tiene role STUDENT
    const body = request.body as any;
    if (!body?.role || body.role !== 'STUDENT') return;

    const instituteId = (request as any).institute?.id ?? request.user?.instituteId;
    if (!instituteId) return; // Sin instituto identificado → dejar pasar (otro middleware manejará)

    const limits = await getInstituteLimits(instituteId);
    if (!limits) return; // No encontrado → continuar (no bloquear por error de DB)

    // Verificar billing status
    if (limits.billingStatus === 'SUSPENDED') {
        return reply.status(403).send({
            error: 'Instituto suspendido',
            code: 'INSTITUTE_SUSPENDED',
            message: 'El instituto tiene su servicio suspendido. Contacte a soporte.',
        });
    }

    if (limits.currentStudents >= limits.maxStudents) {
        return reply.status(403).send({
            error: 'Límite de estudiantes alcanzado',
            code: 'STUDENT_LIMIT_REACHED',
            message: `El plan ${limits.plan} permite un máximo de ${limits.maxStudents} estudiantes. Actualmente tiene ${limits.currentStudents}.`,
            details: {
                plan: limits.plan,
                current: limits.currentStudents,
                max: limits.maxStudents,
                upgradeRequired: true,
            },
        });
    }
}

// ─── Middleware: verificar límite de profesores ───────────────────────────────

/**
 * Verifica que el instituto no haya alcanzado su límite de profesores.
 * Debe usarse en preHandler de POST /api/users cuando role === 'TEACHER'.
 */
export async function checkTeacherLimit(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const body = request.body as any;
    if (!body?.role || body.role !== 'TEACHER') return;

    const instituteId = (request as any).institute?.id ?? request.user?.instituteId;
    if (!instituteId) return;

    const limits = await getInstituteLimits(instituteId);
    if (!limits) return;

    if (limits.billingStatus === 'SUSPENDED') {
        return reply.status(403).send({
            error: 'Instituto suspendido',
            code: 'INSTITUTE_SUSPENDED',
            message: 'El instituto tiene su servicio suspendido. Contacte a soporte.',
        });
    }

    if (limits.currentTeachers >= limits.maxTeachers) {
        return reply.status(403).send({
            error: 'Límite de profesores alcanzado',
            code: 'TEACHER_LIMIT_REACHED',
            message: `El plan ${limits.plan} permite un máximo de ${limits.maxTeachers} profesores. Actualmente tiene ${limits.currentTeachers}.`,
            details: {
                plan: limits.plan,
                current: limits.currentTeachers,
                max: limits.maxTeachers,
                upgradeRequired: true,
            },
        });
    }
}

/**
 * Middleware combinado: verifica límite según el rol en request.body.
 * Reemplaza checkStudentLimit + checkTeacherLimit en un solo preHandler.
 */
export async function checkPlanLimits(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const body = request.body as any;
    if (!body?.role) return;

    if (body.role === 'STUDENT') {
        return checkStudentLimit(request, reply);
    }
    if (body.role === 'TEACHER') {
        return checkTeacherLimit(request, reply);
    }
}

// ─── Helpers de contadores atómicos ──────────────────────────────────────────

/**
 * Incrementa currentStudents del instituto en Platform DB.
 * Llamar desde createUser controller cuando role === STUDENT.
 */
export async function incrementStudentCount(instituteId: string): Promise<void> {
    try {
        await platformPrisma.institute.update({
            where: { id: instituteId },
            data: { currentStudents: { increment: 1 } },
        });
    } catch (error) {
        logger.error('Error incrementando contador de estudiantes', { instituteId, error });
    }
}

/**
 * Decrementa currentStudents del instituto en Platform DB.
 * Llamar desde deleteUser controller cuando role === STUDENT.
 */
export async function decrementStudentCount(instituteId: string): Promise<void> {
    try {
        await platformPrisma.institute.update({
            where: { id: instituteId },
            data: { currentStudents: { decrement: 1 } },
        });
    } catch (error) {
        logger.error('Error decrementando contador de estudiantes', { instituteId, error });
    }
}

/**
 * Incrementa currentTeachers del instituto en Platform DB.
 * Llamar desde createUser controller cuando role === TEACHER.
 */
export async function incrementTeacherCount(instituteId: string): Promise<void> {
    try {
        await platformPrisma.institute.update({
            where: { id: instituteId },
            data: { currentTeachers: { increment: 1 } },
        });
    } catch (error) {
        logger.error('Error incrementando contador de profesores', { instituteId, error });
    }
}

/**
 * Decrementa currentTeachers del instituto en Platform DB.
 * Llamar desde deleteUser controller cuando role === TEACHER.
 */
export async function decrementTeacherCount(instituteId: string): Promise<void> {
    try {
        await platformPrisma.institute.update({
            where: { id: instituteId },
            data: { currentTeachers: { decrement: 1 } },
        });
    } catch (error) {
        logger.error('Error decrementando contador de profesores', { instituteId, error });
    }
}
