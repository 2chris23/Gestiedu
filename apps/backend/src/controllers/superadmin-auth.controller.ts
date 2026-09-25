import { FastifyRequest, FastifyReply } from 'fastify';
import { superAdminAuthService } from '../services/superadmin-auth.service';
import {
    comoEstaLaCuenta,
    apuntarFallo,
    olvidarFallos,
    respuestaDeCuentaCerrada,
} from '../utils/no-probar-contrasenas-a-lo-bruto';

/**
 * El mismo freno que la entrada de un liceo, con su propio cajón: la cuenta
 * que ve TODOS los liceos no puede ser la que menos aguanta. Antes solo la
 * frenaba el tope por dirección, que se esquiva repartiendo los intentos
 * (`la-puerta-del-superadmin.test.ts`, SA-BRUTO-01).
 */
const CAJON_DEL_SUPERADMIN = 'superadmin';

export class SuperAdminAuthController {
    async login(request: FastifyRequest<{ Body: { email: string; password: string } }>, reply: FastifyReply) {
        try {
            const { email, password } = request.body;

            if (!email || !password) {
                return reply.status(400).send({ error: 'Email y contraseña son requeridos' });
            }

            if ((await comoEstaLaCuenta(CAJON_DEL_SUPERADMIN, email)).cerrada) {
                return reply.status(429).send(respuestaDeCuentaCerrada());
            }

            try {
                const result = await superAdminAuthService.login(email, password);
                await olvidarFallos(CAJON_DEL_SUPERADMIN, email);
                return reply.send(result);
            } catch (error) {
                // Se apunta exista la cuenta o no: si no, el freno diría cuáles existen.
                await apuntarFallo(CAJON_DEL_SUPERADMIN, email);
                throw error;
            }
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
