import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import {
    verCertificacion,
    verExternas,
    cargarExterno,
    quitarExterno,
    verPlantillas,
    ponerPlantilla,
    volverALaDeSiempre,
} from '../controllers/documentos.controller';

/**
 * LOS DOCUMENTOS OFICIALES (`/api/...`), todos del admin:
 *   - /students/:id/certificacion                la certificación de calificaciones
 *   - /students/:id/calificaciones-externas      los años cursados en otro plantel
 *   - /institutes/current/plantillas[/:tipo]     las plantillas de las constancias
 */
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const soloAdmin = [authenticate, requireAdmin];

export async function documentosRoutes(fastify: FastifyInstance) {
    fastify.get('/students/:id/certificacion', { schema: { params: { type: 'object', properties: { id } } }, preHandler: soloAdmin }, verCertificacion as any);
    fastify.get('/students/:id/calificaciones-externas', { schema: { params: { type: 'object', properties: { id } } }, preHandler: soloAdmin }, verExternas as any);
    fastify.post(
        '/students/:id/calificaciones-externas',
        {
            preHandler: soloAdmin,
            schema: {
                params: { type: 'object', properties: { id } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['grado', 'anoEscolar', 'plantel', 'materias'],
                    properties: {
                        grado: { type: 'integer', minimum: 1, maximum: 6 },
                        anoEscolar: { type: 'string', maxLength: 9 },
                        plantel: { type: 'string', maxLength: 160 },
                        codigoDelPlantel: { type: ['string', 'null'], maxLength: 20 },
                        entidad: { type: ['string', 'null'], maxLength: 60 },
                        materias: {
                            type: 'array',
                            minItems: 1,
                            maxItems: 20,
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['materia'],
                                properties: {
                                    materia: { type: 'string', maxLength: 80 },
                                    nota: { type: ['number', 'null'] },
                                    apreciacion: { type: ['string', 'null'], maxLength: 40 },
                                    tipo: { type: 'string', enum: ['F', 'R', 'MP'] },
                                    fecha: { type: ['string', 'null'], maxLength: 7 },
                                },
                            },
                        },
                    },
                },
            },
        },
        cargarExterno as any
    );
    fastify.delete(
        '/students/:id/calificaciones-externas/:grado',
        { schema: { params: { type: 'object', properties: { id, grado: { type: 'string', pattern: '^[1-6]$' } } } }, preHandler: soloAdmin },
        quitarExterno as any
    );

    fastify.get('/institutes/current/plantillas', { preHandler: soloAdmin }, verPlantillas as any);
    fastify.put(
        '/institutes/current/plantillas/:tipo',
        {
            preHandler: soloAdmin,
            schema: {
                params: { type: 'object', properties: { tipo: { type: 'string', maxLength: 30 } } },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['titulo', 'texto'],
                    properties: { titulo: { type: 'string', maxLength: 80 }, texto: { type: 'string', maxLength: 3000 } },
                },
            },
        },
        ponerPlantilla as any
    );
    fastify.delete('/institutes/current/plantillas/:tipo', { preHandler: soloAdmin }, volverALaDeSiempre as any);
}
