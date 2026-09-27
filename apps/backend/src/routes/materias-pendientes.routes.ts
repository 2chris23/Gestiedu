import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin, requireTeacher } from '../middleware/auth.middleware';
import { listar, delAlumno, acta, ponerMomento, borrarMomento, cambiarProfesor } from '../controllers/materias-pendientes.controller';

/**
 * LAS MATERIAS PENDIENTES (`/api/materias-pendientes`). Cada ruta lleva
 * `authenticate` además de su guardia de rol (los guardias se adelantan).
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;

export async function materiasPendientesRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/',
        { schema: { querystring: { type: 'object', properties: { cicloId: id } } }, preHandler: [authenticate, requireTeacher] },
        listar as any
    );
    fastify.get('/alumno/:studentId', { schema: { params: { type: 'object', properties: { studentId: id } } }, preHandler: [authenticate] }, delAlumno as any);
    fastify.get(
        '/alumno/:studentId/acta',
        {
            schema: { params: { type: 'object', properties: { studentId: id } }, querystring: { type: 'object', properties: { cicloId: id } } },
            preHandler: [authenticate],
        },
        acta as any
    );
    fastify.put(
        '/:id/momentos/:momento',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                params: { type: 'object', required: ['id', 'momento'], properties: { id, momento: { type: 'string', pattern: '^[1-9]$' } } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['nota'],
                    properties: {
                        nota: { type: 'number', minimum: 0, maximum: 20 },
                        fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                        observaciones: { type: 'string', maxLength: 300 },
                    },
                },
            },
        },
        ponerMomento as any
    );
    fastify.delete(
        '/:id/momentos/:momento',
        {
            preHandler: [authenticate, requireTeacher],
            schema: { params: { type: 'object', required: ['id', 'momento'], properties: { id, momento: { type: 'string', pattern: '^[1-9]$' } } } },
        },
        borrarMomento as any
    );
    fastify.put(
        '/:id/profesor',
        {
            preHandler: [authenticate, requireAdmin],
            schema: {
                params: { type: 'object', properties: { id } },
                body: { type: 'object', additionalProperties: false, required: ['profesorId'], properties: { profesorId: { type: ['string', 'null'], maxLength: 64 } } },
            },
        },
        cambiarProfesor as any
    );
}
