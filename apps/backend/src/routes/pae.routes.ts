import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { configDelComedor, guardarConfigDelComedor, registrosDelMes, registrarDia, borrarDia } from '../services/pae.service';
import { instituteTimezone, todayInTimezone } from '../utils/school-time';
import { responderErrorClaro } from '../utils/error-claro';
import { quienBorra } from '../utils/papelera';

/**
 * EL COMEDOR (PAE), `/api/pae`, solo el admin (`services/pae.service.ts`):
 *   GET|PUT    /config                       activo o no, y sus comidas
 *   GET        /registros?mes=AAAA-MM        lo del mes y su resumen
 *   PUT|DELETE /registros/:fecha/:comida     lo de un día y una comida
 * Apagado, todo menos /config responde 403 PAE_APAGADO.
 */
type P = FastifyRequest<{ Params: { fecha: string; comida: string }; Querystring: { mes?: string }; Body: any }>;
const responder = (fn: (r: P) => Promise<unknown>) => async (r: P, reply: FastifyReply) => {
    try {
        return reply.send({ success: true, data: await fn(r) });
    } catch (e) {
        return responderErrorClaro(reply, e);
    }
};
const soloAdmin = { preHandler: [authenticate, requireAdmin] };
const dia = { type: 'object', required: ['fecha', 'comida'], properties: { fecha: { type: 'string', maxLength: 10 }, comida: { type: 'string', maxLength: 20 } } };

export async function paeRoutes(fastify: FastifyInstance) {
    fastify.get('/config', soloAdmin, responder((r) => configDelComedor(r.tenantPrisma)) as any);
    fastify.put(
        '/config',
        {
            ...soloAdmin,
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['enabled', 'comidas'],
                    properties: { enabled: { type: 'boolean' }, comidas: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 20 } } },
                },
            },
        },
        responder((r) => guardarConfigDelComedor(r.tenantPrisma, r.body as any)) as any
    );
    fastify.get(
        '/registros',
        { ...soloAdmin, schema: { querystring: { type: 'object', required: ['mes'], properties: { mes: { type: 'string', maxLength: 7 } } } } },
        responder((r) => registrosDelMes(r.tenantPrisma, String(r.query.mes))) as any
    );
    fastify.put(
        '/registros/:fecha/:comida',
        {
            ...soloAdmin,
            schema: {
                params: dia,
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['recibidas', 'servidas'],
                    properties: {
                        recibidas: { type: 'integer' },
                        servidas: { type: 'integer' },
                        menu: { type: ['string', 'null'], maxLength: 300 },
                        observaciones: { type: ['string', 'null'], maxLength: 1000 },
                    },
                },
            },
        },
        responder(async (r) =>
            registrarDia(
                r.tenantPrisma,
                r.params.fecha,
                r.params.comida,
                r.body as any,
                String((r.user as any)?.userId ?? '') || null,
                todayInTimezone(await instituteTimezone(r.tenantPrisma))
            )
        ) as any
    );
    fastify.delete('/registros/:fecha/:comida', { ...soloAdmin, schema: { params: dia } }, responder((r) => borrarDia(r.tenantPrisma, r.params.fecha, r.params.comida, quienBorra(r as any))) as any);
}
