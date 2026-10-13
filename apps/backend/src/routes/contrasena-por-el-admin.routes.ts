import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { avisar } from '../services/avisos.service';
import { ContrasenaError, ponerContrasenaNueva } from '../services/contrasena-por-el-admin.service';

/**
 * PUT /api/users/:id/contrasena — el admin le pone una contraseña nueva a
 * alguien que la perdió (`services/contrasena-por-el-admin.service.ts`).
 *
 * Solo el admin. Queda en el registro (`auditLog`, sin la contraseña) y se le
 * avisa a esa persona.
 */

function yo(request: FastifyRequest): { id: string; instituteId: string } {
    const u = request.user as any;
    return { id: u?.userId ?? u?.id, instituteId: u?.instituteId };
}

const conId = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } };
const cuerpo = {
    type: 'object',
    required: ['contrasena'],
    additionalProperties: false,
    properties: { contrasena: { type: 'string', minLength: 1, maxLength: 100 } },
};

export async function contrasenaPorElAdminRoutes(fastify: FastifyInstance) {
    fastify.put(
        '/users/:id/contrasena',
        { schema: { params: conId, body: cuerpo }, preHandler: [authenticate, requireAdmin] },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const admin = yo(request);
            try {
                const hecho = await ponerContrasenaNueva(request.tenantPrisma, {
                    usuarioId: id,
                    adminId: admin.id,
                    contrasena: (request.body as { contrasena: string }).contrasena,
                });
                await request.tenantPrisma.auditLog.create({
                    data: {
                        action: 'CAMBIAR_CONTRASENA_POR_EL_ADMIN',
                        entity: 'USER',
                        entityType: 'USER',
                        entityId: id,
                        ipAddress: request.ip,
                        userAgent: String(request.headers['user-agent'] ?? '').slice(0, 250),
                        level: 'SECURITY',
                        userId: admin.id,
                    },
                });
                await avisar(request.tenantPrisma, admin.instituteId, (request.server as any).io, {
                    a: [id],
                    titulo: 'Tu contraseña cambió',
                    mensaje: 'Un administrador te puso una contraseña nueva. Entra con ella; en «Mi cuenta» puedes cambiarla por una tuya.',
                }).catch(() => 0);
                return reply.send(hecho);
            } catch (e) {
                if (e instanceof ContrasenaError) return reply.status(e.statusCode).send({ error: e.message, code: e.code });
                throw e;
            }
        }
    );
}

export default contrasenaPorElAdminRoutes;
