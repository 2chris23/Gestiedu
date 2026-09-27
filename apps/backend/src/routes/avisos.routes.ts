import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { verMisAvisos, leerUno, leerTodos, apuntarTelefono, quitarTelefono, verPreferencias, ponerPreferencias } from '../controllers/avisos.controller';

/**
 * LOS AVISOS (`/api/avisos`), de cualquiera con sesión y siempre los suyos:
 *   GET    /                  la campana: los últimos y cuántos sin leer
 *   PATCH  /:id/leido         marcar uno;  PATCH /leidos  todos
 *   POST   /telefonos         este teléfono recibe avisos (Web Push o Firebase)
 *   DELETE /telefonos         ya no (al cerrar sesión)
 *   GET|PUT /preferencias     avisos al teléfono sí o no
 */
export async function avisosRoutes(fastify: FastifyInstance) {
    const conSesion = { preHandler: [authenticate] };
    fastify.get('/', conSesion, verMisAvisos as any);
    fastify.patch('/leidos', conSesion, leerTodos as any);
    fastify.patch(
        '/:id/leido',
        { ...conSesion, schema: { params: { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 64 } } } } },
        leerUno as any
    );
    fastify.post(
        '/telefonos',
        {
            ...conSesion,
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['tipo', 'destino'],
                    properties: {
                        tipo: { type: 'string', enum: ['WEB', 'FCM'] },
                        destino: { type: 'string', minLength: 10, maxLength: 4096 },
                        llaves: {
                            type: ['object', 'null'],
                            additionalProperties: false,
                            properties: { p256dh: { type: 'string', maxLength: 200 }, auth: { type: 'string', maxLength: 100 } },
                        },
                        aparato: { type: ['string', 'null'], maxLength: 120 },
                    },
                },
            },
        },
        apuntarTelefono as any
    );
    fastify.delete(
        '/telefonos',
        {
            ...conSesion,
            schema: {
                body: { type: 'object', additionalProperties: false, required: ['destino'], properties: { destino: { type: 'string', maxLength: 4096 } } },
            },
        },
        quitarTelefono as any
    );
    fastify.get('/preferencias', conSesion, verPreferencias as any);
    fastify.put(
        '/preferencias',
        {
            ...conSesion,
            schema: { body: { type: 'object', additionalProperties: false, required: ['alTelefono'], properties: { alTelefono: { type: 'boolean' } } } },
        },
        ponerPreferencias as any
    );
}
