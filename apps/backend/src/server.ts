import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { join } from 'path';
import { logger } from './utils/logger';
import { config } from './config/environment';
import { errorHandler } from './middleware/error.middleware';
import prismaPlugin from './plugins/prisma';
import socketPlugin from './plugins/socket';
import helmetPlugin from './plugins/helmet'; // ✅ SECURITY: Comprehensive security headers
import { registerRoutes } from './routes/index';
import { redis, redisPub, redisSub, connectRedis, disconnectRedis } from './config/redis';
import { setupAcademicYearCronJob } from './jobs/academic-year-sync.job';
import { identifyTenant } from './middleware/tenant.middleware';
import { smartCacheMiddleware, cacheOnSendHook } from './middleware/smart-cache.middleware';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: config.upload.maxFileSize,
  });

  // ✅ CORS must be registered BEFORE Helmet to prevent blocking
  // Uses CORS_ORIGIN from env vars (supports comma-separated origins or '*')
  await server.register(cors, {
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept', 'X-Institute-ID', 'X-Institute-Slug'],
    exposedHeaders: ['Content-Length', 'Content-Type', 'X-Cache-Status'],
  });

  // ✅ SECURITY: Registrar plugin de seguridad con Helmet (AFTER CORS)
  await server.register(helmetPlugin);

  // ✅ PERFORMANCE: Compresión gzip/brotli para todas las respuestas JSON
  // Brotli preferido por su mejor ratio; umbral 1KB para no comprimir payloads minúsculos
  await server.register(compress, {
    global: true,
    encodings: ['br', 'gzip', 'deflate'],
    threshold: 1024,
  });

  // JWT: se maneja centralmente en src/config/jwt.ts. No registramos @fastify/jwt para firmar/verificar.

  // Rate limiting - Active in ALL environments
  // In development: per-request key so load testing tools like K6 are not blocked by IP grouping
  // In production: uses RATE_LIMIT_MAX from env vars
  await server.register(rateLimit, {
    max: config.isDevelopment ? 10000 : config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    keyGenerator: (request) => {
      // En desarrollo, cada request tiene su propio bucket (sin bloqueo por IP)
      if (config.isDevelopment) return `dev:${request.id}`;
      // En producción: usar userId autenticado o IP como fallback
      return (request.user as any)?.userId || request.ip;
    },
  });

  // Multipart para subida de archivos
  await server.register(multipart, {
    limits: {
      fileSize: config.upload.maxFileSize,
      files: 5,
      fieldSize: 1024 * 1024, // 1MB
    },
  });

  // Servir archivos estáticos
  await server.register(fastifyStatic, {
    root: join(__dirname, '../public'),
    prefix: '/public/',
  });

  // Servir archivos subidos (uploads) con CORS habilitado
  await server.register(fastifyStatic, {
    root: join(__dirname, '../uploads'),
    prefix: '/uploads/',
    decorateReply: false, // No decorar reply porque ya fue decorado arriba
    setHeaders: (reply) => {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET');
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  });

  // Swagger documentation (OpenAPI 3)
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Sistema de Gestión Escolar API',
        description: 'API para el sistema de gestión escolar',
        version: '1.0.0',
      },
      servers: [
        {
          url: config.isDevelopment ? `http://localhost:${config.port}` : '/',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  if (config.isDevelopment) {
    await server.register(swaggerUI, {
      routePrefix: '/documentation',
      staticCSP: true,
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });
  }

  // Registrar plugins personalizados
  await server.register(prismaPlugin);

  // Asegurar conexión a Redis antes de configurar Socket.io adapter
  let redisConnected = false;
  try {
    redisConnected = await connectRedis();
  } catch (error) {
    server.log.warn('Redis not connected at startup. Continuing without adapter.');
  }

  // Configurar Socket.io con Redis Adapter
  const io = new Server(server.server, {
    cors: {
      origin: config.cors.origin as any,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Configurar Redis adapter para Socket.io (multi-server support)
  if (redisConnected) {
    try {
      io.adapter(createAdapter(redisPub, redisSub));
      logger.info('Socket.io Redis adapter configured');
    } catch (error) {
      logger.warn('Failed to configure Socket.io Redis adapter:', error as any);
    }
  }

  await server.register(socketPlugin, { io });

  // Cerrar Redis en cierre del servidor
  server.addHook('onClose', async () => {
    if (redisConnected) {
      await disconnectRedis().catch(() => { });
    }
  });

  // Middleware global para manejo de errores
  server.setErrorHandler(errorHandler);

  // Middleware de resolución de tenant (multi-tenant)
  server.addHook('onRequest', identifyTenant);

  // Middleware de cache inteligente (después de tenant resolution)
  // onRequest: verifica cache HIT o marca request para ser cacheada
  server.addHook('onRequest', smartCacheMiddleware);

  // Hook global onSend: guarda responses en Redis si la request fue marcada
  server.addHook('onSend', cacheOnSendHook);

  // Registrar todas las rutas
  await registerRoutes(server);

  // Configurar job de sincronización automática de años académicos
  await setupAcademicYearCronJob(server);
  logger.info('Academic year auto-sync job configured');

  // Ruta de salud extendida
  server.get('/health', async () => {
    let dbHealthy = false;
    try {
      await server.prisma.$queryRaw`SELECT 1`;
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    const redisHealthy = await (async () => {
      try {
        return (await redis.ping()) === 'PONG';
      } catch {
        return false;
      }
    })();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      version: process.env.npm_package_version || '1.0.0',
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
    };
  });

  // Ruta raíz informativa
  server.get('/', async (request, reply) => {
    return {
      name: 'Sistema de Gestión Escolar API',
      status: 'online',
      version: process.env.npm_package_version || '1.0.0',
      documentation: '/documentation',
      health: '/health',
      frontend: 'http://localhost:3000',
    };
  });

  return server;
}
