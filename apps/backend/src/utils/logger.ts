import winston from 'winston';
import { config } from '../config/environment';

/**
 * EN PRODUCCIÓN NO SE ESCRIBE UN RENGLÓN POR CONSULTA.
 *
 * `LOG_LEVEL=debug` está bien mientras se programa. Pero si ese `.env` viaja al
 * servidor, la aplicación se pone a escribir una línea por cada acierto y fallo
 * de caché: en una medición de 20 minutos fueron 344.543 líneas, la mitad de
 * todo el registro.
 *
 * Cuesta CPU (armar y escribir texto en vez de atender gente), cuesta disco —que
 * en un alojamiento se llena y tumba la aplicación— y cuesta privacidad, porque
 * esas líneas llevan cédulas de alumnos dentro.
 *
 * Así que en producción el registro nunca baja de "info", diga lo que diga el
 * archivo. Para diagnosticar algo puntual en el servidor está LOG_LEVEL_FORZADO,
 * que hay que poner a mano y a sabiendas.
 */
function nivelSeguro(): string {
  const pedido = config.logging.level;
  if (config.nodeEnv !== 'production') return pedido;

  if (process.env.LOG_LEVEL_FORZADO) return process.env.LOG_LEVEL_FORZADO;

  const demasiadoHabladores = ['debug', 'silly', 'verbose'];
  return demasiadoHabladores.includes(pedido) ? 'info' : pedido;
}

// Configuración del logger según el entorno
const loggerConfig: winston.LoggerOptions = {
  level: nivelSeguro(),
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      // Formatear el mensaje principal
      let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;

      // Agregar metadata si existe
      if (Object.keys(meta).length > 0) {
        logMessage += ` ${JSON.stringify(meta, null, 2)}`;
      }

      // Agregar stack trace si existe
      if (stack) {
        logMessage += `\n${stack}`;
      }

      return logMessage;
    })
  ),
  transports: [
    // Consola para desarrollo
    new winston.transports.Console({
      format: config.isDevelopment
        ? winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
        : winston.format.json(),
    }),

    // Archivo para errores (siempre activo)
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json(),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Archivo combinado en producción
    ...(config.isProduction
      ? [
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.json(),
          maxsize: 5242880, // 5MB
          maxFiles: 10,
        }),
      ]
      : []),
  ],

  // Manejo de excepciones no capturadas
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
    ...(config.isDevelopment ? [new winston.transports.Console()] : []),
  ],

  // Manejo de rechazos de promesas no capturadas
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
    ...(config.isDevelopment ? [new winston.transports.Console()] : []),
  ],
};

// Crear la instancia del logger
export const logger = winston.createLogger(loggerConfig);

// Función para crear un logger específico para un módulo
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

// Función para loggear errores con contexto
export const logErrorWithContext = (error: Error, context?: Record<string, any>) => {
  logger.error('Error occurred', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  });
};

// Función para loggear eventos de auditoría
export const logAudit = (
  action: string,
  userId: string,
  resource: string,
  metadata?: Record<string, any>
) => {
  logger.info(`Audit: ${action} on ${resource}`, {
    audit: true,
    action,
    userId,
    resource,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
};

// Función para loggear eventos de performance
export const logPerformance = (
  operation: string,
  duration: number,
  metadata?: Record<string, any>
) => {
  const level = duration > 1000 ? 'warn' : 'info'; // Advertir si toma más de 1 segundo
  logger[level](`Performance: ${operation} took ${duration}ms`, {
    performance: true,
    operation,
    duration,
    ...metadata,
  });
};

// Función para crear un timer de performance
export const createPerformanceTimer = (operation: string) => {
  const start = Date.now();

  return {
    end: (metadata?: Record<string, any>) => {
      const duration = Date.now() - start;
      logPerformance(operation, duration, metadata);
      return duration;
    },
  };
};

// Función para loggear eventos de base de datos
export const logDatabase = (
  operation: string,
  table: string,
  duration?: number,
  metadata?: Record<string, any>
) => {
  logger.debug(`Database: ${operation} on ${table}`, {
    database: true,
    operation,
    table,
    duration,
    ...metadata,
  });
};

// Función para loggear eventos de caché
export const logCache = (
  operation: 'HIT' | 'MISS' | 'SET' | 'DELETE',
  key: string,
  metadata?: Record<string, any>
) => {
  logger.debug(`Cache: ${operation} for key ${key}`, {
    cache: true,
    operation,
    key,
    ...metadata,
  });
};

// Función para loggear eventos de autenticación
export const logAuth = (
  event: 'LOGIN' | 'LOGOUT' | 'REGISTER' | 'PASSWORD_CHANGE' | 'TOKEN_REFRESH',
  userId: string,
  metadata?: Record<string, any>
) => {
  logger.info(`Auth: ${event} for user ${userId}`, {
    auth: true,
    event,
    userId,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
};

// Middleware para loggear requests HTTP
export const logRequest = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  userId?: string
) => {
  const level = statusCode >= 400 ? 'warn' : 'info';
  logger[level](`${method} ${url} ${statusCode} - ${duration}ms`, {
    http: true,
    method,
    url,
    statusCode,
    duration,
    userId,
  });
};

// Función para loggear eventos de seguridad
export const logSecurity = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  metadata?: Record<string, any>
) => {
  const levelMap: Record<string, 'info' | 'warn' | 'error'> = {
    low: 'info',
    medium: 'warn',
    high: 'error',
    critical: 'error',
  };

  logger[levelMap[severity]](`Security: ${event}`, {
    security: true,
    event,
    severity,
    ...metadata,
  });
};

// Función para loggear eventos de negocio
export const logBusiness = (
  event: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, any>
) => {
  logger.info(`Business: ${event}`, {
    business: true,
    event,
    entityType,
    entityId,
    ...metadata,
  });
};

// Funciones helper para logging con metadata (para compatibilidad con el código existente)
export const logInfo = (message: string | object, metadata?: Record<string, any>) => {
  if (typeof message === 'object') {
    logger.info('Info', { ...message, ...metadata });
  } else {
    logger.info(message, metadata);
  }
};

export const logError = (message: string | object, metadata?: Record<string, any>) => {
  if (typeof message === 'object') {
    logger.error('Error', { ...message, ...metadata });
  } else {
    logger.error(message, metadata);
  }
};

export const logWarn = (message: string | object, metadata?: Record<string, any>) => {
  if (typeof message === 'object') {
    logger.warn('Warning', { ...message, ...metadata });
  } else {
    logger.warn(message, metadata);
  }
};

export const logDebug = (message: string | object, metadata?: Record<string, any>) => {
  if (typeof message === 'object') {
    logger.debug('Debug', { ...message, ...metadata });
  } else {
    logger.debug(message, metadata);
  }
};

export default logger;
