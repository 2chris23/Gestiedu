import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime/library';
import { ZodError } from 'zod';
import { ERROR_MESSAGES } from '../utils/constants';
import { config } from '../config/environment';

import { logger } from '../utils/logger';

// Tipos para errores personalizados
interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  validation?: any;
  details?: any;
  logLevel?: 'info' | 'warn' | 'error';
}

/**
 * Manejador principal de errores - debe usarse como setErrorHandler
 */
export function errorHandler(
  error: FastifyError | CustomError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Determinar nivel de log
  const logLevel = (error as CustomError).logLevel || 'error';

  // Log del error (con diferentes niveles según el tipo)
  const errorInfo = {
    error: {
      name: error.name,
      message: error.message,
      stack: config.isDevelopment ? error.stack : undefined,
      code: (error as any).code,
      statusCode: error.statusCode,
    },
    request: {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: request.user?.userId,
      instituteId: request.user?.instituteId,
    },
  };

  logger[logLevel]('Manejador de errores activado', errorInfo);

  // Errores de Zod (validación)
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: ERROR_MESSAGES.REQUIRED_FIELD,
      message: 'Datos de entrada inválidos',
      details: formatZodErrors(error),
      code: 'VALIDATION_ERROR',
    });
  }

  // Errores de Prisma
  if (error instanceof PrismaClientKnownRequestError) {
    console.error('Prisma error:', errorInfo);
    return handlePrismaError(error, reply);
  }

  if (error instanceof PrismaClientValidationError) {
    console.error('Prisma validation error:', errorInfo);
    return reply.status(400).send({
      error: ERROR_MESSAGES.DATABASE_ERROR,
      message: 'Error de validación en la base de datos',
      code: 'PRISMA_VALIDATION_ERROR',
    });
  }

  // Errores de JWT
  if (error.name === 'JsonWebTokenError' || error.message?.includes('jwt')) {
    console.warn('JWT error:', errorInfo);
    return reply.status(401).send({
      error: ERROR_MESSAGES.TOKEN_INVALID,
      message: 'Token de autenticación inválido',
      code: 'JWT_ERROR',
    });
  }

  // Errores de Fastify
  if (error.statusCode) {
    return handleHttpError(error, reply, errorInfo);
  }

  // Errores no manejados
  console.error('Unhandled error:', errorInfo);
  return reply.status(500).send({
    error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    message: config.isDevelopment ? error.message : 'Error interno del servidor',
    code: 'UNHANDLED_ERROR',
    ...(config.isDevelopment && { stack: error.stack }),
  });
}

/**
 * Manejar errores específicos de Prisma
 */
function handlePrismaError(error: PrismaClientKnownRequestError, reply: FastifyReply) {
  switch (error.code) {
    case 'P2002': // Violación de restricción única
      const target = error.meta?.target as string[] || ['campo'];
      return reply.status(409).send({
        error: ERROR_MESSAGES.DUPLICATE_ENTRY,
        message: `Ya existe un registro con el mismo valor en: ${target.join(', ')}`,
        code: 'DUPLICATE_ENTRY',
        field: target,
      });

    case 'P2001': // Registro no encontrado en relación
    case 'P2018': // Registros requeridos no encontrados
    case 'P2025': // Operación falló porque depende de uno o más registros
      return reply.status(404).send({
        error: ERROR_MESSAGES.RECORD_NOT_FOUND,
        message: 'El registro solicitado no existe',
        code: 'RECORD_NOT_FOUND',
      });

    case 'P2003': // Violación de restricción de clave foránea
      return reply.status(400).send({
        error: 'Restricción de referencia',
        message: 'La operación viola una restricción de referencia',
        code: 'FOREIGN_KEY_CONSTRAINT',
      });

    case 'P2004': // Restricción violada en la base de datos
      return reply.status(400).send({
        error: 'Restricción violada',
        message: 'La operación viola una restricción de la base de datos',
        code: 'CONSTRAINT_VIOLATION',
      });

    case 'P2011': // Restricción null violada
      return reply.status(400).send({
        error: ERROR_MESSAGES.REQUIRED_FIELD,
        message: 'Faltan campos requeridos',
        code: 'NULL_CONSTRAINT_VIOLATION',
      });

    case 'P2014': // ID relacionado inválido
      return reply.status(400).send({
        error: 'Relación inválida',
        message: 'La relación especificada no es válida',
        code: 'INVALID_RELATION',
      });

    default:
      return reply.status(500).send({
        error: ERROR_MESSAGES.DATABASE_ERROR,
        message: 'Error en la base de datos',
        code: `PRISMA_${error.code}`,
      });
  }
}

/**
 * Manejar errores HTTP estándar
 */
function handleHttpError(error: FastifyError | CustomError, reply: FastifyReply, errorInfo: any) {
  const statusCode = (error as any).statusCode || 500;
  
  // Log apropiado según el código de estado
  if (statusCode >= 500) {
    console.error('Server error:', errorInfo);
  } else if (statusCode >= 400) {
    console.warn('Client error:', errorInfo);
  }

  const errorMap: Record<number, { error: string; message: string; code: string }> = {
    400: {
      error: 'Solicitud inválida',
      message: error.message || 'La solicitud contiene datos inválidos',
      code: 'BAD_REQUEST',
    },
    401: {
      error: ERROR_MESSAGES.UNAUTHORIZED,
      message: 'Se requiere autenticación para acceder a este recurso',
      code: 'UNAUTHORIZED',
    },
    403: {
      error: ERROR_MESSAGES.FORBIDDEN,
      message: 'No tienes permisos para realizar esta acción',
      code: 'FORBIDDEN',
    },
    404: {
      error: 'Recurso no encontrado',
      message: 'El recurso solicitado no existe',
      code: 'NOT_FOUND',
    },
    405: {
      error: 'Método no permitido',
      message: 'El método HTTP no está permitido para este endpoint',
      code: 'METHOD_NOT_ALLOWED',
    },
    409: {
      error: 'Conflicto',
      message: 'La solicitud entra en conflicto con el estado actual del recurso',
      code: 'CONFLICT',
    },
    413: {
      error: 'Payload demasiado grande',
      message: 'El tamaño de la solicitud excede el límite permitido',
      code: 'PAYLOAD_TOO_LARGE',
    },
    415: {
      error: 'Tipo de media no soportado',
      message: 'El tipo de contenido no es soportado',
      code: 'UNSUPPORTED_MEDIA_TYPE',
    },
    422: {
      error: 'Entidad no procesable',
      message: 'Los datos proporcionados no pueden ser procesados',
      code: 'UNPROCESSABLE_ENTITY',
    },
    429: {
      error: 'Demasiadas solicitudes',
      message: 'Se ha excedido el límite de solicitudes. Intenta más tarde',
      code: 'TOO_MANY_REQUESTS',
    },
    500: {
      error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
    },
    502: {
      error: 'Bad Gateway',
      message: 'Error en el servidor upstream',
      code: 'BAD_GATEWAY',
    },
    503: {
      error: ERROR_MESSAGES.SERVICE_UNAVAILABLE,
      message: 'Servicio temporalmente no disponible',
      code: 'SERVICE_UNAVAILABLE',
    },
  };

  const errorData = errorMap[statusCode] || errorMap[500];
  
  return reply.status(statusCode).send({
    ...errorData,
    ...((error as any).validation && { details: (error as any).validation }),
    ...(config.isDevelopment && { stack: (error as any).stack }),
  });
}

/**
 * Formatear errores de Zod para una respuesta más amigable
 */
function formatZodErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Middleware para capturar errores no manejados
 */
export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  console.warn(`Route not found: ${request.method} ${request.url}`);
  
  return reply.status(404).send({
    error: 'Endpoint no encontrado',
    message: `La ruta ${request.method} ${request.url} no existe`,
    code: 'ROUTE_NOT_FOUND',
  });
}

/**
 * Crear error personalizado
 */
export function createError(
  statusCode: number,
  message: string,
  code?: string,
  details?: any
): CustomError {
  const error = new Error(message) as CustomError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Errores específicos del dominio
 */
export const AppErrors = {
  // Errores de usuario
  UserNotFound: () => createError(404, ERROR_MESSAGES.USER_NOT_FOUND, 'USER_NOT_FOUND'),
  UserAlreadyExists: () => createError(409, ERROR_MESSAGES.USER_ALREADY_EXISTS, 'USER_ALREADY_EXISTS'),
  UserInactive: () => createError(401, ERROR_MESSAGES.USER_INACTIVE, 'USER_INACTIVE'),
  
  // Errores de autenticación
  InvalidCredentials: () => createError(401, ERROR_MESSAGES.INVALID_CREDENTIALS, 'INVALID_CREDENTIALS'),
  TokenExpired: () => createError(401, ERROR_MESSAGES.TOKEN_EXPIRED, 'TOKEN_EXPIRED'),
  TokenInvalid: () => createError(401, ERROR_MESSAGES.TOKEN_INVALID, 'TOKEN_INVALID'),
  
  // Errores de autorización
  Forbidden: (message?: string) => createError(403, message || ERROR_MESSAGES.FORBIDDEN, 'FORBIDDEN'),
  
  // Errores de validación
  BadRequest: (message?: string) => createError(400, message || 'Solicitud inválida', 'BAD_REQUEST'),
  InvalidGrade: () => createError(400, ERROR_MESSAGES.INVALID_GRADE, 'INVALID_GRADE'),
  InvalidEmail: () => createError(400, ERROR_MESSAGES.INVALID_EMAIL, 'INVALID_EMAIL'),
  
  // Errores de tenant
  TenantNotFound: () => createError(404, ERROR_MESSAGES.TENANT_NOT_FOUND, 'TENANT_NOT_FOUND'),
  InvalidTenant: () => createError(400, ERROR_MESSAGES.INVALID_TENANT, 'INVALID_TENANT'),
};

/**
 * Middleware para logging de errores en auditoría
 */
export async function logErrorToAudit(
  error: any,
  request: FastifyRequest
): Promise<void> {
  if (!config.isProduction) return;
  
  try {
    // Log de auditoría en base de datos
    // await prisma.auditLog.create({
    //   data: {
    //     action: 'ERROR',
    //     entityType: 'System',
    //     entityId: 'error',
    //     newValues: {
    //       error: error.message,
    //       stack: error.stack,
    //       url: request.url,
    //       method: request.method,
    //       userAgent: request.headers['user-agent'],
    //       ip: request.ip,
    //     },
    //     userId: request.user?.userId,
    //     instituteId: request.user?.instituteId || 'system',
    //     ipAddress: request.ip,
    //     userAgent: request.headers['user-agent'],
    //   },
    // });
  } catch (auditError) {
    console.error('Error logging to audit:', auditError);
  }
}
