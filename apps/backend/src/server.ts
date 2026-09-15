import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
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
import topeDeCarga from './plugins/no-aceptar-mas-de-lo-que-aguanta';
import socketPlugin from './plugins/socket';
import helmetPlugin from './plugins/helmet'; // ✅ SECURITY: Comprehensive security headers
import { registerRoutes } from './routes/index';
import { redis, redisPub, redisSub, connectRedis, disconnectRedis } from './config/redis';
import { setupAcademicYearCronJob } from './jobs/academic-year-sync.job';
import { identifyTenant } from './middleware/tenant.middleware';
import { conLiceo } from './config/ambito-del-liceo';
import { smartCacheMiddleware, cacheOnSendHook } from './middleware/smart-cache.middleware';
import { ponerLosGuardiasPrimero } from './middleware/guardias';
import antiDobleEnvio from './plugins/anti-doble-envio';
import { createHash } from 'crypto';
import { deQuienNosFiamos, comoSeExplicaLaConfianza } from './config/de-quien-nos-fiamos';
import avisarCambios from './plugins/avisar-cambios';

export async function buildServer(): Promise<FastifyInstance> {
  /**
   * De quién se acepta la cabecera que dice desde dónde llama la petición.
   * Estaba en `true` —de cualquiera—, y con eso los límites por dirección se
   * esquivan cambiando un número. Ver `config/de-quien-nos-fiamos.ts`.
   */
  const confianza = deQuienNosFiamos();

  const server = Fastify({
    logger: true,
    trustProxy: confianza,
    bodyLimit: config.upload.maxFileSize,
  });

  server.log.info(comoSeExplicaLaConfianza(confianza));

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
  /**
   * A QUIÉN SE LE CUENTAN LAS PETICIONES
   *
   * Antes se contaban por IP. Un liceo sale a internet por una sola conexión,
   * así que las 200 personas conectadas compartían un único cupo de 500 por
   * minuto: dos peticiones y media por persona antes de que a todos les
   * empezara a rebotar. Medido en la prueba de carga: el 17% de las peticiones
   * volvían con "Too Many Requests" sin que nadie abusara de nada.
   *
   * Ahora cada sesión lleva su propia cuenta. Se usa la huella de la credencial,
   * no lo que dice por dentro: no hay que abrirla ni fiarse de ella. Una
   * credencial inventada tendría su propio cupo, pero tampoco pasa de la puerta.
   * Quien llega sin credencial (la pantalla de entrar) sigue contando por IP.
   */
  const cupoDeLaPeticion = (request: FastifyRequest): string => {
    // En desarrollo cada petición va por su cuenta: nada de bloqueos mientras
    // se trabaja.
    if (config.isDevelopment) return `dev:${request.id}`;

    const credencial = request.headers.authorization;
    if (credencial) {
      return `s:${createHash('sha256').update(credencial).digest('hex').slice(0, 32)}`;
    }

    return `ip:${request.ip}`;
  };

  await server.register(rateLimit, {
    max: config.isDevelopment ? 10000 : config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    keyGenerator: cupoDeLaPeticion,
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
      /**
       * `requestsTimeout` alto a propósito.
       *
       * Medido bajo carga: el adaptador de Redis se rendía con "Command timed
       * out" al avisar a una sala grande, y ese fallo llegaba como promesa
       * rechazada que nadie atrapaba — lo que en Node moderno **mata el proceso
       * entero**. El servidor desaparecía sin dejar dicho por qué, con todo el
       * liceo conectado.
       *
       * Cinco segundos por defecto es poco cuando el servidor va apretado. La
       * red de seguridad definitiva está en `utils/no-morir-en-silencio.ts`;
       * esto es para que no haga falta usarla tan seguido.
       */
      io.adapter(createAdapter(redisPub, redisSub, { requestsTimeout: 30000 }));
      logger.info('Socket.io Redis adapter configured');
    } catch (error) {
      logger.warn('Failed to configure Socket.io Redis adapter:', error as any);
    }
  }

  await server.register(socketPlugin, { io });

  // Lo que alguien cambia, lo ven los demás sin recargar. Va después del socket
  // porque necesita el servidor de avisos ya montado.
  await server.register(avisarCambios);

  // Cerrar Redis en cierre del servidor
  server.addHook('onClose', async () => {
    if (redisConnected) {
      await disconnectRedis().catch(() => { });
    }
  });

  // Middleware global para manejo de errores
  server.setErrorHandler(errorHandler);

  // Peticiones sin cuerpo: un DELETE o un POST vacío llegan con `body`
  // indefinido, y cualquier controlador que lo desestructure revienta con un 500
  // en vez de responder qué falta. Se normaliza a un objeto vacío una sola vez
  // aquí, en lugar de proteger 29 controladores por separado.
  server.addHook('preHandler', async (request) => {
    if (request.body === undefined || request.body === null) {
      (request as any).body = {};
    }
  });

  // Pulsar dos veces "guardar" no puede guardar dos veces. Va después de
  // normalizar el cuerpo, porque la huella de la petición se calcula con él.
  // Antes que nada: si ya no puede con más, que lo diga en vez de tragar hasta
  // caerse. Ver `plugins/no-aceptar-mas-de-lo-que-aguanta.ts`.
  await server.register(topeDeCarga);

  await server.register(antiDobleEnvio);

  // Middleware de resolución de tenant (multi-tenant)
  server.addHook('onRequest', identifyTenant);

  /**
   * A PARTIR DE AQUÍ, TODO ES DE ESTE LICEO
   *
   * Lo que se guarde en la memoria rápida de aquí en adelante —en los ganchos,
   * en el controlador, en los servicios— lleva este liceo en la clave sin que
   * nadie tenga que acordarse de ponerlo. El fallo que obligó a esto está
   * contado en `config/ambito-del-liceo.ts`.
   *
   * VA EN FORMA DE CALLBACK A PROPÓSITO. Se probó primero a dejarlo apuntado
   * desde dentro de `identifyTenant`, y **no llegaba**: lo guardado salía en el
   * apartado «sin liceo». El aviso de arranque no dice nada y la fuga seguía
   * viva. Llamando a `done()` DENTRO del ámbito, el resto de la petición cuelga
   * de él y sí llega: el gancho, el controlador y el servicio.
   */
  server.addHook('onRequest', (request: FastifyRequest, _reply, done) => {
    const liceo = request.institute?.id;
    if (!liceo) return done();
    conLiceo(liceo, done);
  });

  // Middleware de cache inteligente (después de tenant resolution)
  // onRequest: verifica cache HIT o marca request para ser cacheada
  server.addHook('onRequest', smartCacheMiddleware);

  // Hook global onSend: guarda responses en Redis si la request fue marcada
  server.addHook('onSend', cacheOnSendHook);

  // Primero se pregunta quién eres, después se mira lo que traes escrito.
  // Tiene que ir ANTES de registrar las rutas: solo alcanza a las que vengan
  // después. Ver `middleware/guardias.ts` para el porqué.
  ponerLosGuardiasPrimero(server);

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
