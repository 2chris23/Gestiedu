import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { obtenerBoleta } from '../controllers/boleta.controller';

export async function boletaRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/:id', {
        preHandler: [authenticate],
    }, obtenerBoleta as any);
}

export default boletaRoutes;
