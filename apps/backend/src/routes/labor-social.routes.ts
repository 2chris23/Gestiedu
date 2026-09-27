import { FastifyInstance } from 'fastify';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import { lista, delAlumno, anotar, borrar } from '../controllers/labor-social.controller';

/**
 * LA LABOR SOCIAL (`/api/labor-social`). Anotar y borrar: el admin o el
 * profesor guía (lo afina el servicio); ver lo de un alumno: quien puede
 * verlo a él.
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;

export async function laborSocialRoutes(fastify: FastifyInstance) {
    fastify.get('/', { preHandler: [authenticate, requireTeacher] }, lista as any);
    fastify.get('/alumno/:studentId', { schema: { params: { type: 'object', properties: { studentId: id } } }, preHandler: [authenticate] }, delAlumno as any);
    fastify.post(
        '/actividades',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['alumnos', 'fecha', 'horas', 'que'],
                    properties: {
                        alumnos: { type: 'array', minItems: 1, maxItems: 60, items: id },
                        fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                        horas: { type: 'number', exclusiveMinimum: 0, maximum: 24 },
                        que: { type: 'string', minLength: 1, maxLength: 200 },
                        donde: { type: ['string', 'null'], maxLength: 160 },
                        proyecto: { type: ['string', 'null'], maxLength: 160 },
                        responsable: { type: ['string', 'null'], maxLength: 120 },
                        observaciones: { type: ['string', 'null'], maxLength: 500 },
                        culminaElProyecto: { type: 'boolean' },
                    },
                },
            },
        },
        anotar as any
    );
    fastify.delete('/actividades/:id', { schema: { params: { type: 'object', properties: { id } } }, preHandler: [authenticate, requireTeacher] }, borrar as any);
}
