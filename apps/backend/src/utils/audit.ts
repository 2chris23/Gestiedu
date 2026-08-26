import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export interface AuditLogData {
  userId?: string;
  action: 'create' | 'read' | 'update' | 'delete';
  resource: string;
  resourceId?: string;
  details?: string;
  ip?: string;
  userAgent?: string;
}

export async function auditLog(data: AuditLogData, prisma?: any): Promise<void> {
  try {
    // Si no se proporciona prisma, crear una instancia temporal
    const db = prisma || new PrismaClient();

    // Log audit event using structured logger
    logger.info('[AUDIT]', {
      timestamp: new Date().toISOString(),
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      details: data.details,
      ip: data.ip,
      userAgent: data.userAgent
    });

    // Aquí se podría agregar el guardado en base de datos cuando se tenga el modelo AuditLog
    /*
    await db.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        details: data.details,
        ip: data.ip,
        userAgent: data.userAgent,
        timestamp: new Date()
      }
    });
    */
  } catch (error) {
    logger.error('Error in audit log:', error);
    // No queremos que los errores de audit afecten la funcionalidad principal
  }
}
