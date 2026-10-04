import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';

/**
 * ¿ES UN «AHORA NO» DE LA BASE? (robustez, 2026-10-04)
 *
 * Con mucha gente a la vez (vuelve la luz, las 7:00) la base puede tardar en
 * dar una conexión (P2024), no poder abrir la transacción a tiempo (P2028) o
 * chocar dos escrituras (P2034, y en crudo 40001/40P01/55P03). Nada de eso es
 * un fallo de lo que se mandó: volver a intentarlo un poco después funciona.
 * Se responde 503 con `Retry-After`, y el teléfono lo deja pendiente y lo
 * reintenta; con 500 lo daba por «no se pudo» (medido: un 500 en una
 * avalancha de 200 teléfonos, `medir:vuelve-la-luz`).
 */
export function esUnAhoraNoDeLaBase(error: any): boolean {
    const codigo = String(error?.code ?? '');
    if (['P2024', 'P2028', 'P2034'].includes(codigo)) return true;
    const pg = String(error?.meta?.code ?? error?.cause?.code ?? '');
    if (['40001', '40P01', '55P03'].includes(pg) || ['40001', '40P01', '55P03'].includes(codigo)) return true;
    return /Unable to start a transaction in the given time|Transaction already closed|deadlock detected|could not serialize access/i.test(String(error?.message ?? ''));
}

export function responderAhoraNo(reply: FastifyReply): FastifyReply {
    return reply
        .status(503)
        .header('Retry-After', '5')
        .send({ error: 'El sistema está con mucha carga en este momento. Se vuelve a intentar solo.', code: 'AHORA_NO' });
}

/**
 * Maneja errores de Prisma de forma específica
 * Convierte errores técnicos en mensajes amigables para el usuario
 */
export function handlePrismaError(
    error: any,
    request: FastifyRequest,
    reply: FastifyReply
): FastifyReply {
    // Por FORMA, no con `instanceof`: el cliente de cada liceo llega envuelto
    // por la extensión de aislamiento y el error deja de reconocerse, así que un
    // duplicado acababa devolviendo 500 en vez de 409.
    const esErrorPrisma =
        error instanceof Prisma.PrismaClientKnownRequestError ||
        (typeof error?.code === 'string' && /^P\d{4}$/.test(error.code));

    if (esUnAhoraNoDeLaBase(error)) {
        request.log.warn({ err: error?.message }, 'La base dijo «ahora no»: 503 para que se reintente');
        return responderAhoraNo(reply);
    }

    if (esErrorPrisma) {
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
