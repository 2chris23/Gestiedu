import { FastifyInstance } from 'fastify';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import { decidir, loQueEspera } from '../services/cambios-sin-conexion.service';
import { responderErrorClaro } from '../utils/error-claro';

/**
 * LO QUE ESPERA LA DECISIÓN DE ALGUIEN (`/api/cambios-en-espera`)
 *
 * Lo hecho sin conexión que chocó con lo que hizo otro y que decide ese otro:
 * notas para una actividad que borró, marcas de un instrumento que cambió.
 *   GET  /                 lo mío por decidir, y lo mío que espera a otro
 *   POST /:id/decidir      { decision }
 *
 * Solo el personal: el alumno y el representante no escriben nada, así que
 * nada suyo espera.
 */
export async function cambiosEnEsperaRoutes(fastify: FastifyInstance) {
    const conSesion = { preHandler: [authenticate, requireTeacher] };

    fastify.get('/', conSesion, async (r: any, reply) => {
        try {
            return reply.send(await loQueEspera(r.tenantPrisma, r.user.id));
        } catch (e) {
            return responderErrorClaro(reply, e);
        }
    });

    fastify.post<{ Params: { id: string }; Body: { decision: string } }>(
        '/:id/decidir',
        {
            ...conSesion,
            schema: {
                params: { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['decision'],
                    properties: { decision: { type: 'string', enum: ['recuperar', 'dejar', 'nuevo', 'anterior'] } },
                },
            },
        },
        async (r: any, reply) => {
            try {
                const hecho = await decidir(r.tenantPrisma, r.server.io, r.user, r.params.id, r.body.decision);
                return reply.send(hecho);
            } catch (e) {
                return responderErrorClaro(reply, e);
            }
        }
    );
}
