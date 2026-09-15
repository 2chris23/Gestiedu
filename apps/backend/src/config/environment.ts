import * as dotenv from 'dotenv';
import { z } from 'zod';
import { resolve } from 'path';

// Cargar variables de entorno
// Cargar archivos .env en orden de prioridad, sobrescribiendo variables existentes
// Esto evita que variables del sistema o de shells previas tomen precedencia
// Orden de menor a mayor prioridad (el último gana): .env, .env.local, .env.<NODE_ENV>, .env.<NODE_ENV>.local
(() => {
  const cwd = process.cwd();
  const nodeEnv = process.env.NODE_ENV || 'development';

  // EXCEPCIÓN: NODE_ENV manda desde el entorno, no desde el archivo.
  //
  // Al desplegar se pone NODE_ENV=production en el servidor. Si un .env
  // olvidado dice development, con `override` ganaba el archivo y la
  // aplicación arrancaba en modo desarrollo sin avisar: registrando cada
  // consulta a la base, con los límites de peticiones flojos y contando los
  // errores de más. Todo lo demás sigue igual que antes.
  const entornoReal = process.env.NODE_ENV;


  const candidates = [
    `.env`,
    `.env.local`,
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ].map((f) => resolve(cwd, f));

  for (const file of candidates) {
    dotenv.config({ path: file, override: true });
  }

  if (entornoReal) process.env.NODE_ENV = entornoReal;

  // EL PUERTO: manda el archivo, y `PORT` del entorno NO se hereda.
  //
  // Se probó a que el entorno mandara sobre el puerto, pensando en los
  // servicios de hospedaje que lo asignan por variable. Resultado inmediato:
  // esta máquina tenía un `PORT=3000` suelto en las variables del usuario, el
  // backend arrancó en el 3000 y chocó con la web. Todo dejó de funcionar.
  //
  // La salida es una variable **propia y explícita**: nadie la tiene suelta por
  // accidente, así que quien la pone es porque quiere. La usan el hospedaje que
  // asigna el puerto y las mediciones, que levantan el servidor en un puerto
  // aparte para no tocar el que ya está en marcha.
  if (process.env.PUERTO_DEL_HOST) process.env.PORT = process.env.PUERTO_DEL_HOST;
})();

// Schema de validación para variables de entorno
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),

  // Base de datos
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),

  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Rate Limiting
  RATE_LIMIT_MAX: z.string().transform(Number).default('100'),
  RATE_LIMIT_TIME_WINDOW: z.string().transform(Number).default('60000'), // 1 minuto

  // Email (opcional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Upload
  MAX_FILE_SIZE: z.string().transform(Number).default('10485760'), // 10MB
  UPLOAD_DIR: z.string().default('./uploads'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Superadmin
  SUPERADMIN_EMAIL: z.string().email().optional(),
  SUPERADMIN_PASSWORD: z.string().optional(),
  SUPERADMIN_JWT_SECRET: z.string().min(32).optional(),

  // Multi-tenant
  BASE_DOMAIN: z.string().default('tuapp.com'),
  PLATFORM_NAME: z.string().default('GestiEdu'),
});

// Validar y exportar configuración
const env = envSchema.parse(process.env);

export const config = {
  // Servidor
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  // Base de datos
  database: {
    url: env.DATABASE_URL,
  },

  // Redis
  redis: {
    url: env.REDIS_URL,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  // CORS
  cors: {
    origin: (() => {
      const raw = env.CORS_ORIGIN;
      // RegExp que acepta localhost y todos sus subdominios en cualquier puerto (para dev)
      const localhostRegex = /^https?:\/\/([a-z0-9-]+\.)?localhost(:\d+)?$/;
      if (raw === '*') {
        // En vez de true (que no funciona con credentials), refleja el Origin del request
        return [localhostRegex];
      }
      return [...raw.split(',').map(o => o.trim()), localhostRegex];
    })(),
  },

  // Rate Limiting
  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW,
  },

  // Email
  email: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },

  // Upload
  upload: {
    maxFileSize: env.MAX_FILE_SIZE,
    uploadDir: env.UPLOAD_DIR,
  },

  // Logging
  logging: {
    level: env.LOG_LEVEL,
  },

  // Superadmin
  superadmin: {
    email: env.SUPERADMIN_EMAIL,
    password: env.SUPERADMIN_PASSWORD,
    jwtSecret: env.SUPERADMIN_JWT_SECRET || env.JWT_SECRET + '-superadmin',
  },

  // Multi-tenant
  multiTenant: {
    baseDomain: env.BASE_DOMAIN,
    platformName: env.PLATFORM_NAME,
  },
};

export default config;
