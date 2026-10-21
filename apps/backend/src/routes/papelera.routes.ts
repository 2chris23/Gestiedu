import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { responderErrorClaro } from '../utils/error-claro';
import { auditLog } from '../utils/audit';
import { laPapelera, restaurar, borrarParaSiempre, diasDeLaPapelera, ponerDiasDeLaPapelera, DIAS_MINIMO, DIAS_MAXIMO } from '../services/papelera.service';

/**
 * LA PAPELERA DEL ADMIN (19-oct-2026; `services/papelera.service.ts`)
 *
 *   GET    /api/papelera?pagina=          lo borrado, de 20 en 20, con cuándo se va para siempre
 *   POST   /api/papelera/:op/restaurar    lo devuelve entero (o nada: 409 YA_EXISTE / FALTA_LO_DE_ARRIBA)
 *   DELETE /api/papelera/:op              borrar para siempre, ya
 *   GET    /api/papelera/ajustes          el plazo del liceo
 *   PUT    /api/papelera/ajustes          { dias } de 7 a 90
 *
 * Solo el admin: lo borrado puede ser de cualquiera.
 */

const admin = { preHandler: [authenticate, requireAdmin] };
const conOperacion = { type: 'object', required: ['op'], properties: { op: { type: 'string', minLength: 1, maxLength: 400 } } };
const liceoDe = (r: FastifyRequest) => (r as any).institute?.id ?? (r.user as any)?.instituteId ?? '';
const quienDe = (r: FastifyRequest) => (r.user as any)?.userId ?? (r.user as any)?.id;

export async function papeleraRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/papelera',
        { ...admin, schema: { querystring: { type: 'object', properties: { pagina: { type: 'integer', minimum: 1, maximum: 10000 } } } } },
        async (request: any, reply: FastifyReply) => {
            try {
                return reply.send({ success: true, data: await laPapelera(request.tenantPrisma, liceoDe(request), request.query?.pagina ?? 1) });
            } catch (e) {
                return responderErrorClaro(reply, e);
            }
        }
    );

    fastify.get('/papelera/ajustes', admin, async (request, reply) => {
        return reply.send({ success: true, data: { dias: await diasDeLaPapelera(liceoDe(request)), minimo: DIAS_MINIMO, maximo: DIAS_MAXIMO } });
    });

    fastify.put(
        '/papelera/ajustes',
        { ...admin, schema: { body: { type: 'object', required: ['dias'], additionalProperties: false, properties: { dias: { type: 'integer' } } } } },
        async (request: any, reply: FastifyReply) => {
            try {
                const dias = await ponerDiasDeLaPapelera(liceoDe(request), request.body.dias);
                return reply.send({ success: true, data: { dias } });
            } catch (e) {
                return responderErrorClaro(reply, e);
            }
        }
    );

    fastify.post(
        '/papelera/:op/restaurar',
        { ...admin, schema: { params: conOperacion } },
        async (request: any, reply: FastifyReply) => {
            try {
                const r = await restaurar(request.tenantPrisma, request.params.op);
                await auditLog({ userId: quienDe(request), action: 'update', resource: 'papelera', details: `Restaurado: ${r.que} (${r.restauradas} filas)` }, request.tenantPrisma).catch(() => undefined);
                return reply.send({ success: true, data: r });
            } catch (e) {
                return responderErrorClaro(reply, e);
            }
        }
    );

    fastify.delete(
        '/papelera/:op',
        { ...admin, schema: { params: conOperacion } },
        async (request: any, reply: FastifyReply) => {
            try {
                const n = await borrarParaSiempre(request.tenantPrisma, request.params.op);
                await auditLog({ userId: quienDe(request), action: 'delete', resource: 'papelera', details: `Borrado para siempre (${n} filas)` }, request.tenantPrisma).catch(() => undefined);
                return reply.send({ success: true, data: { borradas: n } });
            } catch (e) {
                return responderErrorClaro(reply, e);
            }
        }
    );
}
