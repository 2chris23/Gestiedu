import { FastifyRequest, FastifyReply } from 'fastify';
import {
    verifySuperAdminAccessToken,
    extractTokenFromHeader,
    SuperAdminJWTPayload,
} from '../config/jwt';
import { platformPrisma } from '../config/database';

// Extend FastifyRequest to include superAdmin
declare module 'fastify' {
    interface FastifyRequest {
        superAdmin?: {
            id: string;
            email: string;
            role: 'SUPERADMIN';
            impersonating?: {
                instituteId: string;
                adminId: string;
            };
        };
    }
}

/**
 * Middleware que verifica que el JWT es de un SuperAdmin.
 * Usa un issuer/audience diferente al JWT de instituto.
 * Si el token no es válido o no tiene role SUPERADMIN → 403
 *
 * SEGURIDAD: Además de verificar el JWT, valida que el SuperAdmin
 * siga existiendo y esté activo en la platform DB. Esto permite
 * revocar un token de superadmin comprometido desactivando la cuenta.
 */
export async function superAdminAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
) {
    try {
        const token = extractTokenFromHeader(request.headers.authorization);

        if (!token) {
            return reply.status(401).send({
                error: 'Token de autenticación requerido',
                code: 'SUPERADMIN_AUTH_REQUIRED',
            });
        }

        // Verificar con el secret y issuer/audience del superadmin
        const decoded: SuperAdminJWTPayload = verifySuperAdminAccessToken(token);

        if (decoded.role !== 'SUPERADMIN') {
            return reply.status(403).send({
                error: 'Acceso denegado. Se requieren permisos de SuperAdmin.',
                code: 'SUPERADMIN_FORBIDDEN',
            });
        }

        // SEGURIDAD: Verificar que la cuenta siga activa en la platform DB.
        // Esto permite revocar acceso desactivando la cuenta (mitiga tokens robados).
        try {
            const admin = await platformPrisma.superAdmin.findUnique({
                where: { id: decoded.id },
                select: { id: true, isActive: true },
            });
            if (!admin || !admin.isActive) {
                return reply.status(401).send({
                    error: 'Cuenta de SuperAdmin inactiva o eliminada',
                    code: 'SUPERADMIN_ACCOUNT_INACTIVE',
                });
            }
        } catch (dbError) {
            // Fail-closed: si no podemos verificar la cuenta, rechazar
            return reply.status(401).send({
                error: 'No se pudo verificar la cuenta de SuperAdmin',
                code: 'SUPERADMIN_VERIFICATION_FAILED',
            });
        }

        // Inyectar datos del superadmin en el request
        request.superAdmin = {
            id: decoded.id,
            email: decoded.email,
            role: 'SUPERADMIN',
            impersonating: decoded.impersonating,
        };
    } catch (error) {
        return reply.status(401).send({
            error: 'Token de SuperAdmin inválido o expirado',
            code: 'SUPERADMIN_TOKEN_INVALID',
        });
    }
}
