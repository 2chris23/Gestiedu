import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import fastifyRateLimit from '@fastify/rate-limit';
import { redis } from '../config/redis';

const rateLimitPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Obtener la configuración de Rate Limit desde las variables de entorno
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
  const timeWindow = parseInt(process.env.RATE_LIMIT_TIME_WINDOW || '60000', 10); // 1 minuto por defecto

  // Only use Redis if it's actually connected, otherwise use in-memory storage
  const isRedisConnected = redis && redis.status === 'ready';

  // Configurar opciones de Rate Limit
  const rateLimitOptions: any = {
    max: maxRequests,
    timeWindow,
    // Only use Redis if connected, otherwise use default in-memory store
    ...(isRedisConnected ? { redis } : {}),
    // Función para generar la clave de rate limit basada en el usuario real
    keyGenerator: (request: FastifyRequest) => {
      // En el endpoint de login: usar el email del body como clave
      // Así cada usuario tiene su propio contador aunque vengan de la misma IP
      if (request.url.includes('/auth/login') && request.method === 'POST') {
        const body = request.body as any;
        const email = body?.email || request.ip;
        const instituteSlug = (request.headers['x-institute-slug'] as string) || 'global';
        return `login:${instituteSlug}:${email}`;
      }
      // Para rutas autenticadas: usar instituteId + userId
      const instituteId = (request.headers['x-institute-id'] as string) || 'global';
      const userId = (request.user as any)?.id || request.ip;
      return `${instituteId}:${userId}`;
    },
    // Personalizar la respuesta de error
    errorResponseBuilder: (request: FastifyRequest, context: any) => {
      return {
        success: false,
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.after}`,
        expiresIn: context.after,
      };
    },
    // Excluir rutas del rate limit
    skip: (request: FastifyRequest) => {
      return (
        request.url.startsWith('/health') ||
        request.url.startsWith('/documentation') ||
        request.url.startsWith('/api/v1/auth/refresh-token')
      );
    },
  };

  // Registrar el plugin de Rate Limit con las opciones configuradas
  await fastify.register(fastifyRateLimit, rateLimitOptions);

  // Log de la configuración de Rate Limit
  fastify.log.info(
    `Rate limit configured with max ${maxRequests} requests per ${timeWindow}ms`
  );
};

export default fastifyPlugin(rateLimitPlugin);