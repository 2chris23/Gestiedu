import { FastifyInstance } from 'fastify';
import { authenticate, requireTeacher } from '../middleware/auth.middleware';
import { panel, crearCitacion, asistencia, hoja, mias } from '../controllers/citaciones.controller';

/**
 * EL PANEL DE OBSERVACIONES Y LAS CITACIONES (`/api/...`):
 *   GET  /observations/panel                 el panel del personal (filtros)
 *   POST /observations/:id/citaciones        citar al representante
 *   PUT  /citaciones/:id/asistencia          ¿vino? y lo que se habló
 *   GET  /citaciones/:id                     la hoja (personal que cita y el representante)
 *   GET  /citaciones/mias                    las de los representados (representante)
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;

export async function citacionesRoutes(fastify: FastifyInstance) {
    fastify.get('/observations/panel', { preHandler: [authenticate, requireTeacher] }, panel as any);
    fastify.post(
        '/observations/:id/citaciones',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                params: { type: 'object', properties: { id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['fecha', 'hora', 'lugar', 'motivo'],
                    properties: {
                        fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                        hora: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
                        lugar: { type: 'string', maxLength: 120 },
                        motivo: { type: 'string', maxLength: 500 },
                    },
                },
            },
        },
        crearCitacion as any
    );
    fastify.put(
        '/citaciones/:id/asistencia',
        {
            preHandler: [authenticate, requireTeacher],
            schema: {
                params: { type: 'object', properties: { id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['estado'],
                    properties: {
                        estado: { type: 'string', enum: ['PENDIENTE', 'ASISTIO', 'NO_ASISTIO'] },
                        loQueSeHablo: { type: 'string', maxLength: 2000 },
                    },
                },
            },
        },
        asistencia as any
    );
    fastify.get('/citaciones/mias', { preHandler: [authenticate] }, mias as any);
    fastify.get('/citaciones/:id', { schema: { params: { type: 'object', properties: { id } } }, preHandler: [authenticate] }, hoja as any);
}
