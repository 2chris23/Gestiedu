import { PrismaClient } from '@prisma/client';
import { ActionType } from '../utils/prisma-enums';

/**
 * Servicio de Auditoría
 * Registra acciones críticas para trazabilidad y cumplimiento
 */

export interface AuditLogData {
    userId: string;
    action: ActionType;
    entity: string;
    entityType: string;
    entityId: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Registra una acción en el log de auditoría
 */
export async function logAuditAction(
    prisma: PrismaClient,
    data: AuditLogData
): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                action: data.action,
                entity: data.entity,
                entityType: data.entityType,
                entityId: data.entityId,
                metadata: data.details ? data.details : undefined,
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
                userId: data.userId
            }
        });
    } catch (error) {
        // No fallar la operación principal si falla el log
        console.error('Error al crear log de auditoría:', error);
    }
}

/**
 * Helper para crear logs de auditoría desde request de Fastify
 */
export function createAuditLogger(prisma: PrismaClient) {
    return {
        /**
         * Log de eliminación de estudiante
         */
        logDeleteStudent: async (
            userId: string,
            studentId: string,
            studentName: string,
            reason?: string,
            ipAddress?: string,
            userAgent?: string
        ) => {
            await logAuditAction(prisma, {
                userId,
                action: ActionType.DELETE,
                entity: 'STUDENT',
                entityType: 'User',
                entityId: studentId,
                details: {
                    studentName,
                    reason: reason || 'No especificado'
                },
                ipAddress,
                userAgent
            });
        },

        /**
         * Log de cambio de calificación
         */
        logUpdateGrade: async (
            userId: string,
            gradeId: string,
            studentId: string,
            subjectId: string,
            oldScore: number,
            newScore: number,
            ipAddress?: string,
            userAgent?: string
        ) => {
            await logAuditAction(prisma, {
                userId,
                action: ActionType.UPDATE,
                entity: 'GRADE',
                entityType: 'Grade',
                entityId: gradeId,
                details: {
                    studentId,
                    subjectId,
                    oldScore,
                    newScore,
                    difference: newScore - oldScore
                },
                ipAddress,
                userAgent
            });
        },

        /**
         * Log de eliminación de calificación
         */
        logDeleteGrade: async (
            userId: string,
            gradeId: string,
            studentId: string,
            score: number,
            ipAddress?: string,
            userAgent?: string
        ) => {
            await logAuditAction(prisma, {
                userId,
                action: ActionType.DELETE,
                entity: 'GRADE',
                entityType: 'Grade',
                entityId: gradeId,
                details: {
                    studentId,
                    score
                },
                ipAddress,
                userAgent
            });
        },

        /**
         * Log de cambio de rol de usuario
         */
        logChangeUserRole: async (
            userId: string,
            targetUserId: string,
            oldRole: string,
            newRole: string,
            ipAddress?: string,
            userAgent?: string
        ) => {
            await logAuditAction(prisma, {
                userId,
                action: ActionType.UPDATE,
                entity: 'USER_ROLE',
                entityType: 'User',
                entityId: targetUserId,
                details: {
                    oldRole,
                    newRole
                },
                ipAddress,
                userAgent
            });
        },

        /**
         * Log de desactivación de usuario
         */
        logDeactivateUser: async (
            userId: string,
            targetUserId: string,
            targetUserName: string,
            reason?: string,
            ipAddress?: string,
            userAgent?: string
        ) => {
            await logAuditAction(prisma, {
                userId,
                action: ActionType.UPDATE,
                entity: 'USER_STATUS',
                entityType: 'User',
                entityId: targetUserId,
                details: {
                    userName: targetUserName,
                    action: 'deactivate',
                    reason: reason || 'No especificado'
                },
                ipAddress,
                userAgent
            });
        },

        /**
         * Log de cambio de contraseña de otro usuario
         */
        logChangeOtherPassword: async (
            userId: string,
            targetUserId: string,
            targetUserName: string,
            ipAddress?: string,
            userAgent?: string
        ) => {
            await logAuditAction(prisma, {
                userId,
                action: ActionType.UPDATE,
                entity: 'USER_PASSWORD',
                entityType: 'User',
                entityId: targetUserId,
                details: {
                    userName: targetUserName,
                    changedBy: 'admin'
                },
                ipAddress,
                userAgent
            });
        },

        /**
         * Log genérico para otras acciones
         */
        log: logAuditAction
    };
}

export default {
    logAuditAction,
    createAuditLogger
};
