import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { prisma, disconnectDatabase } from '../config/database';

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  const isTestEnv = process.env.NODE_ENV === 'test';

  if (!isTestEnv) {
    // En producción/desarrollo: conectar explícitamente al arrancar
    await prisma.$connect();
  }
  // En tests: la conexión se establece lazy en el primer query real
  // (createTestServer() ya inyectó la DATABASE_URL correcta antes de buildServer())

  // Agregar la instancia de Prisma al contexto de Fastify
  fastify.decorate('prisma', prisma);

  // Cerrar la conexión cuando el servidor se cierre
  fastify.addHook('onClose', async () => {
    await disconnectDatabase();
  });
};

export default fp(prismaPlugin, {
  name: 'prisma',
});
