import winston from 'winston';
import { config } from '../config/environment';
import { taparDatos, taparEnTexto } from './datos-en-registros';

/** Antes que nada: ni cédulas, ni correos, ni contraseñas al registro (REGISTRO-*). */
const tapar = winston.format((info) => {
  // Con su nombre: `password`, `token`… se reconocen por la clave.
  const claves = Object.keys(info).filter((k) => k !== 'level' && k !== 'timestamp' && k !== 'message' && k !== 'stack');
  const tapado = taparDatos(Object.fromEntries(claves.map((k) => [k, (info as any)[k]]))) as Record<string, unknown>;
  for (const k of claves) (info as any)[k] = tapado[k];
  if (typeof info.message === 'string') info.message = taparEnTexto(info.message);
  if (typeof (info as any).stack === 'string') (info as any).stack = taparEnTexto((info as any).stack);
  return info;
});

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
    winston.format.errors({ stack: true }),
    tapar(),
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


export const logError = (message: string | object, metadata?: Record<string, any>) => {
  if (typeof message === 'object') {
    logger.error('Error', { ...message, ...metadata });
  } else {
    logger.error(message, metadata);
  }
};



export default logger;
