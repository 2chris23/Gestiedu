import { ERROR_MESSAGES } from './constants';

/**
 * Clase base para errores personalizados del sistema escolar
 */
export abstract class BaseError extends Error {
  public readonly statusCode: number;
  public code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;
  public readonly logLevel: 'info' | 'warn' | 'error';

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    logLevel: 'info' | 'warn' | 'error' = 'error',
    details?: any
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.logLevel = logLevel;
    this.details = details;
    
    // Mantener el stack trace apropiado
    Error.captureStackTrace(this, this.constructor);
    
    // Establecer el nombre de la clase
    this.name = this.constructor.name;
  }

  /**
   * Serializar error para respuesta HTTP
   */
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Errores de validación (400)
 */
export class ValidationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, 'warn', details);
  }
}

/**
 * Errores de autenticación (401)
 */
export class AuthenticationError extends BaseError {
  constructor(message: string, code: string = 'AUTHENTICATION_ERROR') {
    super(message, 401, code, true, 'warn');
  }
}

/**
 * Errores de autorización (403)
 */
export class AuthorizationError extends BaseError {
  constructor(message: string, code: string = 'AUTHORIZATION_ERROR') {
    super(message, 403, code, true, 'warn');
  }
}

/**
 * Errores de recursos no encontrados (404)
 */
export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string) {
    const message = identifier 
      ? `${resource} con identificador '${identifier}' no encontrado`
      : `${resource} no encontrado`;
    super(message, 404, 'NOT_FOUND', true, 'info');
  }
}

/**
 * Errores de conflicto (409)
 */
export class ConflictError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', true, 'warn', details);
  }
}

/**
 * Errores de datos no procesables (422)
 */
export class UnprocessableEntityError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', true, 'warn', details);
  }
}

/**
 * Errores internos del servidor (500)
 */
export class InternalServerError extends BaseError {
  constructor(message: string = 'Error interno del servidor', code: string = 'INTERNAL_SERVER_ERROR') {
    super(message, 500, code, true, 'error');
  }
}

/**
 * Errores de servicio no disponible (503)
 */
export class ServiceUnavailableError extends BaseError {
  constructor(service: string) {
    super(`Servicio ${service} no disponible temporalmente`, 503, 'SERVICE_UNAVAILABLE', true, 'error');
  }
}

/**
 * Errores específicos del dominio escolar
 */
export class UserNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Usuario', identifier);
    this.code = 'USER_NOT_FOUND';
  }
}

export class UserAlreadyExistsError extends ConflictError {
  constructor(email?: string) {
    const message = email 
      ? `Ya existe un usuario con el email '${email}'`
      : 'El usuario ya existe';
    super(message);
    this.code = 'USER_ALREADY_EXISTS';
  }
}

export class UserInactiveError extends AuthenticationError {
  constructor() {
    super('Usuario inactivo', 'USER_INACTIVE');
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  constructor() {
    super('Credenciales inválidas', 'INVALID_CREDENTIALS');
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor() {
    super('Token expirado', 'TOKEN_EXPIRED');
  }
}

export class TokenInvalidError extends AuthenticationError {
  constructor() {
    super('Token inválido', 'TOKEN_INVALID');
  }
}

export class InsufficientPermissionsError extends AuthorizationError {
  constructor(requiredPermission?: string) {
    const message = requiredPermission 
      ? `Permisos insuficientes. Se requiere: ${requiredPermission}`
      : 'Permisos insuficientes para realizar esta acción';
    super(message, 'INSUFFICIENT_PERMISSIONS');
  }
}

export class ClassroomNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Aula', identifier);
    this.code = 'CLASSROOM_NOT_FOUND';
  }
}

export class SubjectNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Materia', identifier);
    this.code = 'SUBJECT_NOT_FOUND';
  }
}

export class ActivityNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Actividad', identifier);
    this.code = 'ACTIVITY_NOT_FOUND';
  }
}

export class GradeNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Calificación', identifier);
    this.code = 'GRADE_NOT_FOUND';
  }
}

export class InvalidGradeError extends ValidationError {
  constructor(value: number) {
    super(`Calificación inválida: ${value}. Debe estar entre 0 y 20`, { value });
    this.code = 'INVALID_GRADE';
  }
}

export class InstituteNotFoundError extends NotFoundError {
  constructor(identifier?: string) {
    super('Instituto', identifier);
    this.code = 'INSTITUTE_NOT_FOUND';
  }
}

export class InvalidEmailError extends ValidationError {
  constructor(email: string) {
    super(`Email inválido: ${email}`, { email });
    this.code = 'INVALID_EMAIL';
  }
}

export class InvalidDateError extends ValidationError {
  constructor(date: string, field?: string) {
    const message = field 
      ? `Fecha inválida en campo '${field}': ${date}`
      : `Fecha inválida: ${date}`;
    super(message, { date, field });
    this.code = 'INVALID_DATE';
  }
}

export class DatabaseError extends InternalServerError {
  constructor(operation: string, table?: string) {
    const message = table 
      ? `Error en base de datos: ${operation} en tabla '${table}'`
      : `Error en base de datos: ${operation}`;
    super(message, 'DATABASE_ERROR');
  }
}

export class CacheError extends InternalServerError {
  constructor(operation: string, key?: string) {
    const message = key 
      ? `Error en caché: ${operation} para clave '${key}'`
      : `Error en caché: ${operation}`;
    super(message, 'CACHE_ERROR');
  }
}

export class RateLimitError extends BaseError {
  constructor(limit: number, window: number) {
    super(
      `Límite de solicitudes excedido: ${limit} por ${window}ms`,
      429,
      'RATE_LIMIT_EXCEEDED',
      true,
      'warn',
      { limit, window }
    );
  }
}

export class PayloadTooLargeError extends BaseError {
  constructor(size: number, maxSize: number) {
    super(
      `Payload demasiado grande: ${size} bytes. Máximo permitido: ${maxSize} bytes`,
      413,
      'PAYLOAD_TOO_LARGE',
      true,
      'warn',
      { size, maxSize }
    );
  }
}

export class UnsupportedMediaTypeError extends BaseError {
  constructor(mediaType: string, allowedTypes: string[]) {
    super(
      `Tipo de media no soportado: ${mediaType}. Tipos permitidos: ${allowedTypes.join(', ')}`,
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      true,
      'warn',
      { mediaType, allowedTypes }
    );
  }
}

/**
 * Factory para crear errores específicos del dominio
 */
export class ErrorFactory {
  static user = {
    notFound: (identifier?: string) => new UserNotFoundError(identifier),
    alreadyExists: (email?: string) => new UserAlreadyExistsError(email),
    inactive: () => new UserInactiveError(),
  };

  static auth = {
    invalidCredentials: () => new InvalidCredentialsError(),
    tokenExpired: () => new TokenExpiredError(),
    tokenInvalid: () => new TokenInvalidError(),
    insufficientPermissions: (permission?: string) => new InsufficientPermissionsError(permission),
  };

  static classroom = {
    notFound: (identifier?: string) => new ClassroomNotFoundError(identifier),
  };

  static subject = {
    notFound: (identifier?: string) => new SubjectNotFoundError(identifier),
  };

  static activity = {
    notFound: (identifier?: string) => new ActivityNotFoundError(identifier),
  };

  static grade = {
    notFound: (identifier?: string) => new GradeNotFoundError(identifier),
    invalid: (value: number) => new InvalidGradeError(value),
  };

  static institute = {
    notFound: (identifier?: string) => new InstituteNotFoundError(identifier),
  };

  static validation = {
    invalidEmail: (email: string) => new InvalidEmailError(email),
    invalidDate: (date: string, field?: string) => new InvalidDateError(date, field),
    general: (message: string, details?: any) => new ValidationError(message, details),
  };

  static database = {
    error: (operation: string, table?: string) => new DatabaseError(operation, table),
  };

  static cache = {
    error: (operation: string, key?: string) => new CacheError(operation, key),
  };

  static http = {
    notFound: (resource: string, identifier?: string) => new NotFoundError(resource, identifier),
    conflict: (message: string, details?: any) => new ConflictError(message, details),
    unprocessableEntity: (message: string, details?: any) => new UnprocessableEntityError(message, details),
    internalServerError: (message?: string, code?: string) => new InternalServerError(message, code),
    serviceUnavailable: (service: string) => new ServiceUnavailableError(service),
    rateLimit: (limit: number, window: number) => new RateLimitError(limit, window),
    payloadTooLarge: (size: number, maxSize: number) => new PayloadTooLargeError(size, maxSize),
    unsupportedMediaType: (mediaType: string, allowedTypes: string[]) => 
      new UnsupportedMediaTypeError(mediaType, allowedTypes),
  };
}

/**
 * Utility para verificar si un error es operacional
 */
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
};

/**
 * Utility para extraer información de error para logging
 */
export const extractErrorInfo = (error: Error) => {
  if (error instanceof BaseError) {
    return {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
      isOperational: error.isOperational,
      logLevel: error.logLevel,
      details: error.details,
      stack: error.stack,
    };
  }

  return {
    name: error.name,
    message: error.message,
    statusCode: 500,
    code: 'UNKNOWN_ERROR',
    isOperational: false,
    logLevel: 'error' as const,
    stack: error.stack,
  };
};

export default ErrorFactory;
