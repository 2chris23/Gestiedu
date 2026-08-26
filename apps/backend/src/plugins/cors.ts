import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyCors from '@fastify/cors';

const corsPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Obtener la configuración de CORS desde las variables de entorno
  const corsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*';
  const isProduction = process.env.NODE_ENV === 'production';

  // ✅ SECURITY: Warn if using permissive CORS in production
  if (isProduction && corsOrigin === '*') {
    fastify.log.warn('⚠️  WARNING: CORS is set to allow all origins (*) in PRODUCTION. This is a security risk!');
    fastify.log.warn('⚠️  Set CORS_ORIGIN or FRONTEND_URL environment variable to restrict origins.');
  }

  // En dev: permite localhost y cualquier subdominio *.localhost en cualquier puerto
  // En prod: se controla por CORS_ORIGIN del .env
  const localhostRegex = /^https?:\/\/([a-z0-9-]+\.)?localhost(:\d+)?$/;

  let originConfig: boolean | string | RegExp | (string | RegExp)[];

  if (corsOrigin === '*') {
    originConfig = true; // Todos los orígenes
  } else {
    const explicitOrigins = corsOrigin.split(',').map(o => o.trim());
    // Siempre incluir localhost y sus subdominios para desarrollo local
    originConfig = [...explicitOrigins, localhostRegex];
  }

  const corsOptions = {
    origin: originConfig,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Tenant-ID',
      'X-Institute-ID',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Total-Pages'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };

  // Registrar el plugin de CORS con las opciones configuradas
  await fastify.register(fastifyCors, corsOptions);

  // Log de la configuración de CORS
  if (corsOrigin === '*') {
    fastify.log.info('🌐 CORS configured to allow ALL origins (*)');
  } else {
    fastify.log.info(`🔒 CORS configured with restricted origins: ${corsOrigin}`);
  }
};

export default fastifyPlugin(corsPlugin);