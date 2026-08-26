import { FastifyInstance } from 'fastify';
import { superAdminAuthController } from '../controllers/superadmin-auth.controller';
import { superAdminAuthMiddleware } from '../middleware/superadmin-auth.middleware';
import { userRateLimit } from '../middleware/auth.middleware';

export async function superAdminAuthRoutes(fastify: FastifyInstance) {
    // Rutas públicas (sin auth) — con rate limit anti fuerza bruta
    fastify.post('/login', { preHandler: userRateLimit as any }, superAdminAuthController.login);
    fastify.post('/refresh', superAdminAuthController.refresh);

    // Rutas protegidas (requieren auth de superadmin)
    fastify.register(async (protectedRoutes) => {
        protectedRoutes.addHook('onRequest', superAdminAuthMiddleware);

        protectedRoutes.get('/me', superAdminAuthController.me);
        protectedRoutes.post('/logout', superAdminAuthController.logout);
    });
}
