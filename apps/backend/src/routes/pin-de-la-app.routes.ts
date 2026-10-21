import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { avisar } from '../services/avisos.service';
import { comprobarMiPin, crearMiPin, estadoDelPin, PinError, ponerElPinDe } from '../services/pin-de-la-app.service';

/**
 * EL PIN DE LA APP (ver `services/pin-de-la-app.service.ts`)
 *
 *   GET    /api/auth/pin            ¿tengo PIN? (y su versión)
 *   POST   /api/auth/pin            crear el mío, solo si no tengo
 *   POST   /api/auth/pin/comprobar  comprobarlo con conexión (10 fallos: trabado)
 *   GET    /api/users/:id/pin       el admin ve si tiene y si está trabado
 *   PUT    /api/users/:id/pin       el admin lo cambia
 *   DELETE /api/users/:id/pin       el admin lo resetea
 *
 * Lo del admin queda en el registro (`auditLog`, sin el PIN) y se le avisa a
 * esa persona.
 */

function yo(request: FastifyRequest): { id: string; instituteId: string } {
    const u = request.user as any;
    return { id: u?.userId ?? u?.id, instituteId: u?.instituteId };
}

function responder(reply: FastifyReply, e: unknown) {
    if (e instanceof PinError) return reply.status(e.statusCode).send({ error: e.message, code: e.code });
    throw e;
}

const cuerpoConPin = {
    type: 'object',
    required: ['pin'],
    additionalProperties: false,
    properties: { pin: { type: 'string', pattern: '^[0-9]{4}$' } },
};
const conId = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } };

export async function pinDeLaAppRoutes(fastify: FastifyInstance) {
    fastify.get('/auth/pin', { preHandler: [authenticate] }, async (request, reply) => {
        try {
            return reply.send(await estadoDelPin(request.tenantPrisma, yo(request).id));
        } catch (e) {
            return responder(reply, e);
        }
    });

    fastify.post('/auth/pin', { schema: { body: cuerpoConPin }, preHandler: [authenticate] }, async (request, reply) => {
        try {
            return reply.status(201).send(await crearMiPin(request.tenantPrisma, yo(request).id, (request.body as any).pin));
        } catch (e) {
            return responder(reply, e);
        }
    });

    fastify.post(
        '/auth/pin/comprobar',
        // Sin cupo propio por dirección: un liceo entero sale por una sola. El
        // freno es la cuenta de fallos en la base (10 seguidos: trabado).
        { schema: { body: cuerpoConPin }, preHandler: [authenticate] },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                return reply.send(await comprobarMiPin(request.tenantPrisma, yo(request).id, (request.body as any).pin));
            } catch (e) {
                return responder(reply, e);
            }
        }
    );

    const delAdmin = async (request: FastifyRequest, reply: FastifyReply, pin: string | null) => {
        const { id } = request.params as { id: string };
        try {
            const estado = await ponerElPinDe(request.tenantPrisma, id, pin);
            const admin = yo(request);
            await request.tenantPrisma.auditLog.create({
                data: {
                    action: pin === null ? 'RESETEAR_PIN_DE_LA_APP' : 'CAMBIAR_PIN_DE_LA_APP',
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
                titulo: pin === null ? 'Tu PIN de la app se reseteó' : 'Tu PIN de la app cambió',
                mensaje:
                    pin === null
                        ? 'Un administrador reseteó tu PIN. La próxima vez que lo pida la app, crea uno nuevo.'
                        : 'Un administrador cambió tu PIN de la app.',
            }).catch(() => 0);
            return reply.send(estado);
        } catch (e) {
            return responder(reply, e);
        }
    };

    // Lo que enseña la ficha del usuario al admin: ¿tiene? ¿está trabado?
    fastify.get('/users/:id/pin', { schema: { params: conId }, preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
        try {
            return reply.send(await estadoDelPin(request.tenantPrisma, (request.params as { id: string }).id));
        } catch (e) {
            return responder(reply, e);
        }
    });

    fastify.put('/users/:id/pin',{ schema: { params: conId, body: cuerpoConPin }, preHandler: [authenticate, requireAdmin] }, (request, reply) =>
        delAdmin(request, reply, (request.body as any).pin)
    );
    fastify.delete('/users/:id/pin', { schema: { params: conId }, preHandler: [authenticate, requireAdmin] }, (request, reply) =>
        delAdmin(request, reply, null)
    );
}

export default pinDeLaAppRoutes;
