import { FastifyRequest, FastifyReply } from 'fastify';
import { superAdminAuthService } from '../services/superadmin-auth.service';

export class SuperAdminAuthController {
    async login(request: FastifyRequest<{ Body: { email: string; password: string } }>, reply: FastifyReply) {
        try {
            const { email, password } = request.body;

            if (!email || !password) {
                return reply.status(400).send({ error: 'Email y contraseña son requeridos' });
            }

            const result = await superAdminAuthService.login(email, password);
            return reply.send(result);
        } catch (error: any) {
            const statusCode = error.statusCode || 500;
            return reply.status(statusCode).send({ error: error.message || 'Error interno' });
        }
    }

    async refresh(request: FastifyRequest<{ Body: { refreshToken: string } }>, reply: FastifyReply) {
        try {
            const { refreshToken } = request.body;

            if (!refreshToken) {
                return reply.status(400).send({ error: 'Refresh token requerido' });
            }

            const result = await superAdminAuthService.refreshToken(refreshToken);
            return reply.send(result);
        } catch (error: any) {
            const statusCode = error.statusCode || 500;
            return reply.status(statusCode).send({ error: error.message || 'Error interno' });
        }
    }

    async logout(request: FastifyRequest, reply: FastifyReply) {
        try {
            const superAdminId = (request as any).superAdmin?.id;
            if (!superAdminId) {
                return reply.status(401).send({ error: 'No autenticado' });
            }

            await superAdminAuthService.logout(superAdminId);
            return reply.send({ message: 'Sesión cerrada exitosamente' });
        } catch (error: any) {
            return reply.status(500).send({ error: error.message || 'Error interno' });
        }
    }

    async me(request: FastifyRequest, reply: FastifyReply) {
        try {
            const superAdminId = (request as any).superAdmin?.id;
            if (!superAdminId) {
                return reply.status(401).send({ error: 'No autenticado' });
            }

            const profile = await superAdminAuthService.getProfile(superAdminId);
            return reply.send(profile);
        } catch (error: any) {
            const statusCode = error.statusCode || 500;
            return reply.status(statusCode).send({ error: error.message || 'Error interno' });
        }
    }
}

export const superAdminAuthController = new SuperAdminAuthController();
