import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

// Plugin: rate limit por IP
export const ipRateLimitPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1'],
    onExceeding: (req: FastifyRequest, key: string) => {
      console.warn(`IP con exceso de peticiones: ${key}`);
    },
    onExceeded: (req: FastifyRequest, key: string) => {
      console.error(`IP bloqueada por exceder el límite: ${req.ip} (key: ${key})`);
    },
  });
});

// Plugin: rate limit por usuario
export const userRateLimitPlugin = fp(async function (fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    keyGenerator: (req: any) => (req.user ? req.user.userId : req.ip),
    max: 100,
    timeWindow: '1 minute',
    onExceeding: (req: FastifyRequest, key: string) => {
      console.warn(`Usuario con exceso de peticiones: ${key}`);
    },
    onExceeded: (req: FastifyRequest, key: string) => {
      const id = (req as any).user?.userId || req.ip;
      console.error(`Usuario bloqueado por exceder el límite: ${id} (key: ${key})`);
    },
  });
});

export default {
  ipRateLimitPlugin,
  userRateLimitPlugin,
};
