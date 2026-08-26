import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';

/**
 * Maneja errores de Prisma de forma específica
 * Convierte errores técnicos en mensajes amigables para el usuario
 */
export function handlePrismaError(
    error: any,
    request: FastifyRequest,
    reply: FastifyReply
): FastifyReply {
    // Errores conocidos de Prisma
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case 'P2002': // Unique constraint violation
                return reply.status(409).send({
                    error: 'Ya existe un registro con esos datos',
                    code: 'DUPLICATE_ENTRY',
                    field: error.meta?.target,
                });

            case 'P2025': // Record not found
                return reply.status(404).send({
                    error: 'Registro no encontrado',
                    code: 'NOT_FOUND',
                });

            case 'P2003': // Foreign key constraint
                return reply.status(400).send({
                    error: 'Referencia inválida. Verifica que los datos relacionados existan',
                    code: 'INVALID_REFERENCE',
                    field: error.meta?.field_name,
                });

            case 'P2014': // Relation violation
                return reply.status(400).send({
                    error: 'No se puede eliminar porque tiene datos relacionados',
                    code: 'HAS_DEPENDENCIES',
                });

            case 'P2016': // Query interpretation error
                return reply.status(400).send({
                    error: 'Error en la consulta. Verifica los datos enviados',
                    code: 'QUERY_ERROR',
                });

            case 'P2021': // Table does not exist
                request.log.error({ err: error.message }, 'Error de esquema de BD');
                return reply.status(500).send({
                    error: 'Error de configuración del sistema. Contacta al administrador',
                    code: 'SCHEMA_ERROR',
                });

            case 'P2024': // Timed out fetching a new connection
                request.log.error({ err: error.message }, 'Timeout de conexión a BD');
                return reply.status(503).send({
                    error: 'El sistema está experimentando alta carga. Intenta más tarde',
                    code: 'CONNECTION_TIMEOUT',
                });
        }
    }

    // Errores de validación de Prisma
    if (error instanceof Prisma.PrismaClientValidationError) {
        request.log.warn({ err: error.message }, 'Error de validación Prisma');
        return reply.status(400).send({
            error: 'Datos inválidos. Verifica la información enviada',
            code: 'VALIDATION_ERROR',
        });
    }

    // Error de conexión a BD
    if (error instanceof Prisma.PrismaClientInitializationError) {
        request.log.error({ err: error.message }, 'Error de inicialización de Prisma');
        return reply.status(503).send({
            error: 'Servicio temporalmente no disponible. Intenta más tarde',
            code: 'SERVICE_UNAVAILABLE',
        });
    }

    // Error de conexión perdida
    if (error instanceof Prisma.PrismaClientRustPanicError) {
        request.log.error({ err: error.message }, 'Error crítico de Prisma');
        return reply.status(500).send({
            error: 'Error crítico del sistema. Contacta al administrador',
            code: 'CRITICAL_ERROR',
        });
    }

    // Error genérico - Log completo en servidor, mensaje genérico al cliente
    request.log.error({
        err: error.message,
        stack: error.stack,
        user: (request as any).user?.id,
        path: request.url,
        method: request.method,
    }, 'Error no manejado');

    return reply.status(500).send({
        error: 'Ocurrió un error inesperado. Contacta al administrador',
        code: 'INTERNAL_ERROR',
        requestId: request.id,
    });
}

/**
 * Middleware global de manejo de errores para Fastify
 */
export function errorHandler(
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply
) {
    return handlePrismaError(error, request, reply);
}

export default {
    handlePrismaError,
    errorHandler,
};
