import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { ERROR_MESSAGES } from '../utils/constants';

/**
 * Crear middleware de validación para diferentes partes de la request
 */
export function validateSchema<T>(
  schema: ZodSchema<T>,
  source: 'body' | 'params' | 'query' | 'headers' = 'body'
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request[source];
      const validatedData = schema.parse(data);

      // Reemplazar los datos originales con los validados
      (request as any)[source] = validatedData;

    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return reply.status(400).send({
          error: ERROR_MESSAGES.REQUIRED_FIELD,
          message: `Errores de validación en ${source}`,
          details: formattedErrors,
          code: 'VALIDATION_ERROR'
        });
      }

      throw error;
    }
  };
}

/**
 * Middleware específico para validar el body de la request
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return validateSchema(schema, 'body');
}

/**
 * Middleware específico para validar parámetros de ruta
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return validateSchema(schema, 'params');
}

/**
 * Middleware específico para validar query parameters
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return validateSchema(schema, 'query');
}

/**
 * Middleware específico para validar headers
 */
export function validateHeaders<T>(schema: ZodSchema<T>) {
  return validateSchema(schema, 'headers');
}

/**
 * Validar múltiples partes de la request
 */
export function validateMultiple(validations: {
  body?: ZodSchema<any>;
  params?: ZodSchema<any>;
  query?: ZodSchema<any>;
  headers?: ZodSchema<any>;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const errors: Array<{ source: string; field: string; message: string }> = [];

    for (const [source, schema] of Object.entries(validations)) {
      if (schema) {
        try {
          const data = request[source as keyof FastifyRequest];
          const validatedData = schema.parse(data);
          (request as any)[source] = validatedData;
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach(err => {
              errors.push({
                source,
                field: err.path.join('.'),
                message: err.message
              });
            });
          }
        }
      }
    }

    if (errors.length > 0) {
      return reply.status(400).send({
        error: ERROR_MESSAGES.REQUIRED_FIELD,
        message: 'Errores de validación',
        details: errors,
        code: 'VALIDATION_ERROR'
      });
    }
  };
}

/**
 * Sanitizar datos de entrada removiendo campos no permitidos
 */
export function sanitizeInput(
  allowedFields: string[],
  source: 'body' | 'query' = 'body'
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const data = request[source] as any;

    if (data && typeof data === 'object') {
      const sanitized: any = {};

      for (const field of allowedFields) {
        if (data.hasOwnProperty(field)) {
          sanitized[field] = data[field];
        }
      }

      (request as any)[source] = sanitized;
    }
  };
}

/**
 * Validar formato de ID de Prisma (CUID)
 */
export function validateCUID(paramName: string = 'id') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as any)?.[paramName];

    if (!id) {
      return reply.status(400).send({
        error: 'ID requerido',
        message: `El parámetro ${paramName} es requerido`,
        code: 'MISSING_ID'
      });
    }

    // Validar formato CUID (generado por Prisma)
    const cuidRegex = /^c[a-z0-9]{24}$/;
    if (!cuidRegex.test(id)) {
      return reply.status(400).send({
        error: 'ID inválido',
        message: `El formato del ID ${paramName} es inválido`,
        code: 'INVALID_ID_FORMAT'
      });
    }
  };
}

/**
 * Validar paginación de query parameters
 */
export function validatePagination() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any;

    if (query.page) {
      const page = parseInt(query.page, 10);
      if (isNaN(page) || page < 1) {
        return reply.status(400).send({
          error: 'Página inválida',
          message: 'El número de página debe ser un entero positivo',
          code: 'INVALID_PAGE'
        });
      }
      query.page = page;
    } else {
      query.page = 1;
    }

    if (query.limit) {
      const limit = parseInt(query.limit, 10);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        return reply.status(400).send({
          error: 'Límite inválido',
          message: 'El límite debe ser un entero entre 1 y 100',
          code: 'INVALID_LIMIT'
        });
      }
      query.limit = limit;
    } else {
      query.limit = 10;
    }

    // Calcular offset
    query.offset = (query.page - 1) * query.limit;
  };
}

/**
 * Validar fechas en formato ISO
 */
export function validateDateRange(
  startDateField: string = 'startDate',
  endDateField: string = 'endDate'
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const data = (request.body || request.query) as any;

    const startDate = data[startDateField];
    const endDate = data[endDateField];

    if (startDate && !isValidISODate(startDate)) {
      return reply.status(400).send({
        error: 'Fecha de inicio inválida',
        message: 'La fecha de inicio debe estar en formato ISO 8601',
        code: 'INVALID_START_DATE'
      });
    }

    if (endDate && !isValidISODate(endDate)) {
      return reply.status(400).send({
        error: 'Fecha de fin inválida',
        message: 'La fecha de fin debe estar en formato ISO 8601',
        code: 'INVALID_END_DATE'
      });
    }

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return reply.status(400).send({
        error: 'Rango de fechas inválido',
        message: 'La fecha de fin debe ser posterior a la fecha de inicio',
        code: 'INVALID_DATE_RANGE'
      });
    }
  };
}

/**
 * Validar que un campo sea único en la base de datos
 */
export function validateUnique(
  tableName: string,
  fieldName: string,
  excludeId?: string
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const data = request.body as any;
    const value = data[fieldName];

    if (!value) return;

    // Esta validación se implementaría consultando la base de datos
    // Por ahora solo mostramos la estructura

    // const existing = await prisma[tableName].findFirst({
    //   where: {
    //     [fieldName]: value,
    //     ...(excludeId && { id: { not: excludeId } })
    //   }
    // });

    // if (existing) {
    //   return reply.status(409).send({
    //     error: 'Valor duplicado',
    //     message: `El valor para ${fieldName} ya existe`,
    //     code: 'DUPLICATE_VALUE'
    //   });
    // }
  };
}

/**
 * Función auxiliar para validar fechas ISO
 */
function isValidISODate(dateString: string): boolean {
  if (typeof dateString !== 'string') return false;

  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString === date.toISOString();
}

/**
 * Validar que los campos requeridos estén presentes
 */
export function requireFields(...fields: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const data = request.body as any;
    const missing: string[] = [];

    for (const field of fields) {
      if (!data || data[field] === undefined || data[field] === null || data[field] === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return reply.status(400).send({
        error: ERROR_MESSAGES.REQUIRED_FIELD,
        message: `Campos requeridos faltantes: ${missing.join(', ')}`,
        code: 'MISSING_REQUIRED_FIELDS',
        details: missing
      });
    }
  };
}

export default {
  validateSchema,
  validateBody,
  validateParams,
  validateQuery,
  validateHeaders,
  validateMultiple,
  sanitizeInput,
  validateCUID,
  validatePagination,
  validateDateRange,
  validateUnique,
  requireFields
};
